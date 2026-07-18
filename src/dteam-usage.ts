// dteam-usage.jsonl 的只读扫描与数字聚合。
// 不读取 worker prompt、输出、工具参数或 WorkerReport，只消费脱敏 usage 与归属字段。

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";

import type { DteamUsageSummary, TimeRange } from "./types.ts";

export interface DteamUsageRecord {
	version: 1;
	timestamp: string;
	parentSessionId: string;
	project: string;
	workerId: string;
	requestedTier: string;
	activeTier: string;
	candidateId: string;
	model: string;
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

export function getDefaultDteamUsagePath(home = homedir()): string {
	return join(home, ".pi", "agent", "dteam-usage.jsonl");
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

export function filterDteamUsageByParentSession(records: DteamUsageRecord[], parentSessionId: string): DteamUsageRecord[] {
	return records.filter((record) => record.parentSessionId === parentSessionId);
}

export function filterDteamUsage(records: DteamUsageRecord[], range?: TimeRange): DteamUsageRecord[] {
	if (!range) return records;
	return records.filter((record) => {
		const timestamp = Date.parse(record.timestamp);
		return Number.isFinite(timestamp) && timestamp >= range.since && timestamp < range.until;
	});
}

export function rollupDteamUsage(records: DteamUsageRecord[]): DteamUsageSummary {
	const seen = new Set<string>();
	const workers = new Set<string>();
	const byModel = new Map<string, { model: string; responses: number; totalTokens: number; totalCost: number }>();
	const byTier = new Map<string, { tier: string; responses: number; totalTokens: number; totalCost: number }>();
	const rollup: DteamUsageSummary = {
		recordCount: 0,
		workerCount: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
		totalCost: 0,
		byModel: [],
		byTier: [],
	};
	for (const record of records) {
		if (!record || typeof record.dedupKey !== "string" || seen.has(record.dedupKey)) continue;
		seen.add(record.dedupKey);
		workers.add(record.workerId);
		const usage = record.usage ?? {};
		const totalTokens = asNumber(usage.totalTokens) || asNumber(usage.input) + asNumber(usage.output) + asNumber(usage.cacheRead) + asNumber(usage.cacheWrite);
		const totalCost = asNumber(usage.cost?.total);
		rollup.recordCount += 1;
		rollup.inputTokens += asNumber(usage.input);
		rollup.outputTokens += asNumber(usage.output);
		rollup.cacheReadTokens += asNumber(usage.cacheRead);
		rollup.cacheWriteTokens += asNumber(usage.cacheWrite);
		rollup.totalTokens += totalTokens;
		rollup.totalCost += totalCost;

		const model = byModel.get(record.model) ?? { model: record.model, responses: 0, totalTokens: 0, totalCost: 0 };
		model.responses += 1;
		model.totalTokens += totalTokens;
		model.totalCost += totalCost;
		byModel.set(record.model, model);

		const tier = byTier.get(record.activeTier) ?? { tier: record.activeTier, responses: 0, totalTokens: 0, totalCost: 0 };
		tier.responses += 1;
		tier.totalTokens += totalTokens;
		tier.totalCost += totalCost;
		byTier.set(record.activeTier, tier);
	}
	rollup.workerCount = workers.size;
	rollup.byModel = [...byModel.values()].sort((left, right) => right.totalTokens - left.totalTokens);
	rollup.byTier = [...byTier.values()].sort((left, right) => right.totalTokens - left.totalTokens);
	return rollup;
}

export async function scanDteamUsage(path = getDefaultDteamUsagePath()): Promise<DteamUsageRecord[]> {
	let text: string;
	try {
		text = await readFile(path, "utf8");
	} catch {
		return [];
	}
	const records: DteamUsageRecord[] = [];
	for (const line of text.split(/\r?\n/)) {
		if (!line.trim()) continue;
		try {
			const value = JSON.parse(line) as DteamUsageRecord;
			if (value?.version === 1 && value.workerId && value.activeTier && value.model && value.usage && value.dedupKey) records.push(value);
		} catch {
			// 与 session/audit scanner 一致：坏行不阻断其他本地记录。
		}
	}
	return records;
}
