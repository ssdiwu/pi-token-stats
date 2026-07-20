// 会话扫描层（复用自 pi-daily session-scan.ts）。
// 只读扫描 ~/.pi/agent/sessions/**/*.jsonl，容错解析坏行，收集错误。
// 绝不修改会话文件。

import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline";

import type { ParsedSession, ScanError, ScanSessionsOptions, ScanSessionsResult, SessionEntry, SessionFile, SessionHeader } from "./types.ts";

export function getDefaultSessionRoot(homeDir = os.homedir()): string {
	return path.join(homeDir, ".pi", "agent", "sessions");
}

async function pathExists(targetPath: string): Promise<boolean> {
	try {
		await fs.access(targetPath);
		return true;
	} catch {
		return false;
	}
}

async function collectJsonlFiles(directory: string, files: string[] = []): Promise<string[]> {
	let entries: Array<{ name: string; isDirectory(): boolean; isFile(): boolean }> = [];
	try {
		entries = (await fs.readdir(directory, { withFileTypes: true })) as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>;
	} catch {
		return files;
	}

	for (const entry of entries) {
		const entryPath = path.join(directory, entry.name);
		if (entry.isDirectory()) {
			await collectJsonlFiles(entryPath, files);
			continue;
		}
		if (entry.isFile() && entry.name.endsWith(".jsonl")) {
			files.push(entryPath);
		}
	}
	return files;
}

export async function findSessionFiles(sessionRoot = getDefaultSessionRoot()): Promise<string[]> {
	if (!(await pathExists(sessionRoot))) {
		return [];
	}
	const files = await collectJsonlFiles(sessionRoot);
	return files.sort();
}

async function filterFilesModifiedSince(files: string[], modifiedSince: number): Promise<string[]> {
	const results = await Promise.all(files.map(async (file) => {
		try {
			return (await fs.stat(file)).mtimeMs >= modifiedSince ? file : null;
		} catch {
			// 无法读取 mtime 时仍交给扫描层处理，保留原本的错误报告语义。
			return file;
		}
	}));
	return results.filter((file): file is string => Boolean(file));
}

function toSessionEntry(value: unknown): SessionEntry {
	return value && typeof value === "object" ? (value as SessionEntry) : {};
}

function entryTimestamp(entry: SessionEntry): number {
	const messageTimestamp = entry.message?.timestamp;
	if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp) && messageTimestamp > 0) return messageTimestamp;
	if (messageTimestamp) {
		const parsedMessageTimestamp = new Date(messageTimestamp).getTime();
		if (Number.isFinite(parsedMessageTimestamp)) return parsedMessageTimestamp;
	}
	const outerTimestamp = entry.timestamp;
	if (typeof outerTimestamp === "number" && Number.isFinite(outerTimestamp) && outerTimestamp > 0) return outerTimestamp;
	const parsedOuterTimestamp = Date.parse((outerTimestamp as string) ?? "");
	return Number.isFinite(parsedOuterTimestamp) ? parsedOuterTimestamp : 0;
}

function keepEntry(entry: SessionEntry, range?: ScanSessionsOptions["entryRange"]): boolean {
	if (!range || entry.type === "session" || entry.type === "session_info") return true;
	const timestamp = entryTimestamp(entry);
	return timestamp >= range.since && timestamp < range.until;
}

function parseLine(line: string, lineNumber: number, entries: SessionEntry[], errors: ScanError[], range?: ScanSessionsOptions["entryRange"]): void {
	const trimmed = line.trim();
	if (!trimmed) return;
	try {
		const entry = toSessionEntry(JSON.parse(trimmed));
		if (keepEntry(entry, range)) entries.push(entry);
	} catch (error) {
		errors.push({ line: lineNumber, error: error instanceof Error ? error.message : String(error) });
	}
}

function buildParsedSession(entries: SessionEntry[], errors: ScanError[]): ParsedSession {
	const headerEntry = entries.find((entry) => entry?.type === "session") || null;
	const header = headerEntry ? (headerEntry as SessionHeader) : null;
	return { header, entries, errors };
}

export function parseSessionJsonl(content: string, range?: ScanSessionsOptions["entryRange"]): ParsedSession {
	const entries: SessionEntry[] = [];
	const errors: ScanError[] = [];
	const lines = String(content).split(/\r?\n/);
	for (let index = 0; index < lines.length; index += 1) parseLine(lines[index], index + 1, entries, errors, range);
	return buildParsedSession(entries, errors);
}

export async function readSessionFile(file: string, range?: ScanSessionsOptions["entryRange"]): Promise<SessionFile> {
	const entries: SessionEntry[] = [];
	const errors: ScanError[] = [];
	const lines = createInterface({ input: createReadStream(file, { encoding: "utf8" }), crlfDelay: Infinity });
	let lineNumber = 0;
	for await (const line of lines) {
		lineNumber += 1;
		parseLine(line, lineNumber, entries, errors, range);
	}
	return { file, ...buildParsedSession(entries, errors) };
}

const SCAN_CONCURRENCY = 8;

interface FileScanResult {
	session?: SessionFile;
	errors: ScanError[];
}

async function scanFile(file: string, range?: ScanSessionsOptions["entryRange"]): Promise<FileScanResult> {
	try {
		const session = await readSessionFile(file, range);
		return { session, errors: (session.errors || []).map((parseError) => ({ file, ...parseError })) };
	} catch (error) {
		return { errors: [{ file, line: 0, error: error instanceof Error ? error.message : String(error) }] };
	}
}

let scanTail = Promise.resolve();

async function scanSessionsUnlocked(options: ScanSessionsOptions): Promise<ScanSessionsResult> {
	const sessionRoot = options.sessionRoot || getDefaultSessionRoot();
	const discoveredFiles = options.files || (await findSessionFiles(sessionRoot));
	const files = options.modifiedSince === undefined ? discoveredFiles : await filterFilesModifiedSince(discoveredFiles, options.modifiedSince);
	const results: FileScanResult[] = new Array(files.length);
	let nextIndex = 0;

	await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, files.length) }, async () => {
		for (;;) {
			const index = nextIndex++;
			if (index >= files.length) return;
			results[index] = await scanFile(files[index], options.entryRange);
		}
	}));

	const sessions: SessionFile[] = [];
	const errors: ScanError[] = [];
	for (const result of results) {
		if (result.session) sessions.push(result.session);
		errors.push(...result.errors);
	}

	return { sessionRoot, files, sessions, errors };
}

export async function scanSessions(options: ScanSessionsOptions = {}): Promise<ScanSessionsResult> {
	const previous = scanTail;
	let release!: () => void;
	scanTail = new Promise<void>((resolve) => { release = resolve; });
	await previous;
	try {
		return await scanSessionsUnlocked(options);
	} finally {
		release();
	}
}
