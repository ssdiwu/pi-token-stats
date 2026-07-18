import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { filterDteamUsage, filterDteamUsageByParentSession, rollupDteamUsage, scanDteamUsage, type DteamUsageRecord } from "../src/dteam-usage.ts";
import { formatDialogBody } from "../src/format.ts";
import type { TokenStats } from "../src/types.ts";

function record(overrides: Partial<DteamUsageRecord> = {}): DteamUsageRecord {
	return {
		version: 1,
		timestamp: "2026-07-12T10:00:00.000Z",
		parentSessionId: "parent",
		project: "/repo",
		workerId: "worker-1",
		requestedTier: "T3",
		activeTier: "T3",
		candidateId: "candidate-1",
		model: "openai/gpt-5-mini",
		usage: { input: 90, output: 10, cacheRead: 5, totalTokens: 105, cost: { total: 0.02 } },
		dedupKey: "record-1",
		...overrides,
	};
}

const zeroStats: TokenStats = { userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, totalCost: 0 };

test("dteam usage 按时间、worker、模型和档位去重聚合并展示", () => {
	const records = [
		record(),
		record(),
		record({ workerId: "worker-2", activeTier: "T2", candidateId: "candidate-2", model: "anthropic/claude", usage: { input: 40, output: 10, totalTokens: 50, cost: { total: 0.03 } }, dedupKey: "record-2" }),
		record({ timestamp: "2026-07-13T10:00:00.000Z", dedupKey: "outside" }),
	];
	const inRange = filterDteamUsage(records, {
		label: "day",
		since: Date.parse("2026-07-12T00:00:00.000Z"),
		until: Date.parse("2026-07-13T00:00:00.000Z"),
	});
	const summary = rollupDteamUsage(inRange);
	assert.equal(summary.recordCount, 2);
	assert.equal(summary.workerCount, 2);
	assert.equal(summary.totalTokens, 155);
	assert.equal(summary.totalCost, 0.05);
	assert.deepEqual(summary.byTier.map((item) => item.tier), ["T3", "T2"]);

	const body = formatDialogBody(undefined, zeroStats, [], [], "zh-CN", undefined, undefined, summary);
	assert.match(body, /dteam worker：2 个 · 2 次回复 · 155 token · 费用 0\.0500/);
});

test("当前会话按 parentSessionId 只选自己的 worker usage", () => {
	const records = [record(), record({ parentSessionId: "other", workerId: "worker-2", dedupKey: "other" })];
	assert.deepEqual(filterDteamUsageByParentSession(records, "parent").map((item) => item.workerId), ["worker-1"]);
});

test("scanDteamUsage 只读取 v1 完整记录并容忍坏行", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-insights-dteam-"));
	try {
		const path = join(dir, "dteam-usage.jsonl");
		writeFileSync(path, [
			JSON.stringify(record()),
			"not-json {{{",
			JSON.stringify({ ...record({ dedupKey: "future" }), version: 2 }),
			JSON.stringify({ version: 1, workerId: "incomplete" }),
		].join("\n"));
		const records = await scanDteamUsage(path);
		assert.equal(records.length, 1);
		assert.equal(records[0]?.workerId, "worker-1");
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});
