// dgoal audit-usage.jsonl 的只读扫描与数字聚合。
// 不读取 prompt、报告或工具输出，只消费已脱敏的 usage 字段。

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { TimeRange } from "./types.ts";

export interface AuditUsageRecord {
	timestamp: string;
	parentSessionId: string;
	project: string;
	scope: "phase" | "goal";
	model: string;
	attempt: number;
	usage: {
		input?: number;
		output?: number;
		cacheRead?: number;
		cacheWrite?: number;
		totalTokens?: number;
		cost?: { input?: number; output?: number; cacheRead?: number; cacheWrite?: number; total?: number };
	};
	dedupKey: string;
}

export interface AuditUsageRollup {
	recordCount: number;
	attemptCount: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	totalCost: number;
	byModel: Array<{ model: string; attempts: number; totalTokens: number; totalCost: number }>;
}

export function getDefaultAuditUsagePath(home = homedir()): string {
	return join(home, ".pi", "agent", "audit-usage.jsonl");
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function parseTimestamp(value: string): number {
	const timestamp = Date.parse(value);
	return Number.isFinite(timestamp) ? timestamp : 0;
}

export function filterAuditUsage(records: AuditUsageRecord[], range?: TimeRange): AuditUsageRecord[] {
	if (!range) return records;
	return records.filter((record) => {
		const timestamp = parseTimestamp(record.timestamp);
		return timestamp >= range.since && timestamp < range.until;
	});
}

export function rollupAuditUsage(records: AuditUsageRecord[]): AuditUsageRollup {
	const byModel = new Map<string, { model: string; attempts: number; totalTokens: number; totalCost: number }>();
	const rollup: AuditUsageRollup = {
		recordCount: 0,
		attemptCount: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
		totalCost: 0,
		byModel: [],
	};
	const seen = new Set<string>();
	for (const record of records) {
		if (!record || typeof record.dedupKey !== "string" || seen.has(record.dedupKey)) continue;
		seen.add(record.dedupKey);
		const usage = record.usage ?? {};
		const totalTokens = asNumber(usage.totalTokens) || asNumber(usage.input) + asNumber(usage.output) + asNumber(usage.cacheRead) + asNumber(usage.cacheWrite);
		const totalCost = asNumber(usage.cost?.total);
		rollup.recordCount += 1;
		rollup.attemptCount += 1;
		rollup.inputTokens += asNumber(usage.input);
		rollup.outputTokens += asNumber(usage.output);
		rollup.cacheReadTokens += asNumber(usage.cacheRead);
		rollup.cacheWriteTokens += asNumber(usage.cacheWrite);
		rollup.totalTokens += totalTokens;
		rollup.totalCost += totalCost;
		const model = byModel.get(record.model) ?? { model: record.model, attempts: 0, totalTokens: 0, totalCost: 0 };
		model.attempts += 1;
		model.totalTokens += totalTokens;
		model.totalCost += totalCost;
		byModel.set(record.model, model);
	}
	rollup.byModel = [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens);
	return rollup;
}

export async function scanAuditUsage(path = getDefaultAuditUsagePath()): Promise<AuditUsageRecord[]> {
	let text: string;
	try {
		text = await readFile(path, "utf-8");
	} catch {
		return [];
	}
	const records: AuditUsageRecord[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const value = JSON.parse(line) as AuditUsageRecord;
			if (value?.scope && value?.model && value?.usage && value?.dedupKey) records.push(value);
		} catch {
			// Ignore malformed lines; the session scanner has the same tolerant contract.
		}
	}
	return records;
}
