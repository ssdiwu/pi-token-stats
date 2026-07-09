// 会话扫描层（复用自 pi-daily session-scan.ts）。
// 只读扫描 ~/.pi/agent/sessions/**/*.jsonl，容错解析坏行，收集错误。
// 绝不修改会话文件。

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

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

export function parseSessionJsonl(content: string): ParsedSession {
	const entries: SessionEntry[] = [];
	const errors: ScanError[] = [];
	const lines = String(content).split(/\r?\n/);

	for (let index = 0; index < lines.length; index += 1) {
		const line = lines[index].trim();
		if (!line) {
			continue;
		}
		try {
			entries.push(toSessionEntry(JSON.parse(line)));
		} catch (error) {
			errors.push({ line: index + 1, error: error instanceof Error ? error.message : String(error) });
		}
	}

	const headerEntry = entries.find((entry) => entry?.type === "session") || null;
	const header = headerEntry ? (headerEntry as SessionHeader) : null;
	return { header, entries, errors };
}

export async function readSessionFile(file: string): Promise<SessionFile> {
	const content = await fs.readFile(file, "utf8");
	const parsed = parseSessionJsonl(content);
	return { file, ...parsed };
}

const SCAN_CONCURRENCY = 8;

interface FileScanResult {
	session?: SessionFile;
	errors: ScanError[];
}

async function scanFile(file: string): Promise<FileScanResult> {
	try {
		const session = await readSessionFile(file);
		return { session, errors: (session.errors || []).map((parseError) => ({ file, ...parseError })) };
	} catch (error) {
		return { errors: [{ file, line: 0, error: error instanceof Error ? error.message : String(error) }] };
	}
}

export async function scanSessions(options: ScanSessionsOptions = {}): Promise<ScanSessionsResult> {
	const sessionRoot = options.sessionRoot || getDefaultSessionRoot();
	const discoveredFiles = options.files || (await findSessionFiles(sessionRoot));
	const files = options.modifiedSince === undefined ? discoveredFiles : await filterFilesModifiedSince(discoveredFiles, options.modifiedSince);
	const results: FileScanResult[] = new Array(files.length);
	let nextIndex = 0;

	await Promise.all(Array.from({ length: Math.min(SCAN_CONCURRENCY, files.length) }, async () => {
		for (;;) {
			const index = nextIndex++;
			if (index >= files.length) return;
			results[index] = await scanFile(files[index]);
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
