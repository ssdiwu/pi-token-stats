import assert from "node:assert/strict";
import test from "node:test";

import { filterAuditUsage, rollupAuditUsage, scanAuditUsage, type AuditUsageRecord } from "../src/audit-usage.ts";
import { formatDialogBody } from "../src/format.ts";
import type { TokenStats } from "../src/types.ts";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
// 与 pi-dgoal 写入的脱敏 JSONL 记录保持兼容；不用跨仓库 import，保证 package 的测试可独立运行。
const record = (key: string, timestamp: string, model: string, totalTokens: number, totalCost: number): AuditUsageRecord => ({
	timestamp,
	parentSessionId: "session-1",
	project: "/repo",
	scope: "phase",
	model,
	attempt: 1,
	usage: { input: totalTokens - 10, output: 10, totalTokens, cost: { total: totalCost } },
	dedupKey: key,
});

test("pi-dgoal 实际脱敏记录可被 insights 聚合并展示", () => {
	const records: AuditUsageRecord[] = [{
		timestamp: "2026-07-12T10:00:00.000Z",
		parentSessionId: "parent-session",
		project: "/repo",
		scope: "goal",
		model: "openai/gpt-5",
		attempt: 1,
		usage: { input: 1000, output: 234, cacheRead: 50, cacheWrite: 0, totalTokens: 1284, cost: { input: 0.01, output: 0.02, total: 0.03 } },
		dedupKey: "fixture-1",
	}];
	const range = { label: "fixture", since: Date.parse("2026-07-12T00:00:00.000Z"), until: Date.parse("2026-07-13T00:00:00.000Z") };
	const summary = rollupAuditUsage(filterAuditUsage(records, range));
	assert.equal(summary.recordCount, 1);
	assert.equal(summary.totalTokens, 1284);
	assert.equal(summary.totalCost, 0.03);
	assert.deepEqual(summary.byModel[0], { model: "openai/gpt-5", attempts: 1, totalTokens: 1284, totalCost: 0.03 });

	const zeroStats: TokenStats = { userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0, totalTokens: 0, totalCost: 0 };
	const body = formatDialogBody(undefined, zeroStats, [], [], "zh-CN", undefined, summary);
	assert.match(body, /dgoal 审核：1 次 · 1,284 token · 费用 0\.0300/);
});

test("scanAuditUsage 从真实 JSONL 文件读取并容忍坏行", async () => {
	const dir = mkdtempSync(join(tmpdir(), "pi-insights-audit-"));
	try {
		const path = join(dir, "audit-usage.jsonl");
		const good: AuditUsageRecord = {
			timestamp: "2026-07-12T10:00:00.000Z",
			parentSessionId: "s1",
			project: "/repo",
			scope: "goal",
			model: "openai/gpt-5",
			attempt: 1,
			usage: { input: 10, output: 5, totalTokens: 15, cost: { total: 0.01 } },
			dedupKey: "fixture-2",
		};
		writeFileSync(path, [
			JSON.stringify(good),
			"this is not json {{{",
			"",
			JSON.stringify(good),
		].join("\n"));

		const records = await scanAuditUsage(path);
		assert.equal(records.length, 2);
		const rollup = rollupAuditUsage(records);
		assert.equal(rollup.recordCount, 1);
		assert.equal(rollup.totalTokens, 15);
	} finally {
		rmSync(dir, { recursive: true, force: true });
	}
});

test("audit usage 按时间范围聚合并按 dedupKey 去重", () => {
	const records = [
		record("same", "2026-07-12T10:00:00.000Z", "openai/gpt-5", 100, 0.2),
		record("same", "2026-07-12T10:00:00.000Z", "openai/gpt-5", 100, 0.2),
		record("other", "2026-07-13T10:00:00.000Z", "anthropic/claude", 50, 0.1),
	];
	const inRange = filterAuditUsage(records, {
		label: "day",
		since: Date.parse("2026-07-12T00:00:00.000Z"),
		until: Date.parse("2026-07-13T00:00:00.000Z"),
	});
	const rollup = rollupAuditUsage(inRange);
	assert.equal(rollup.recordCount, 1);
	assert.equal(rollup.totalTokens, 100);
	assert.equal(rollup.totalCost, 0.2);
	assert.deepEqual(rollup.byModel[0], { model: "openai/gpt-5", attempts: 1, totalTokens: 100, totalCost: 0.2 });
});
