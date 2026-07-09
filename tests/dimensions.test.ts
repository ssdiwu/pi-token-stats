// 多维分析聚合单元测试（K1 项目 / K2 工具 / K3 错误 / K5 上下文健康）。
// 手造 session 样本，纯函数测试，不 mock 系统。

import assert from "node:assert/strict";
import test from "node:test";

import { rollupByProject, rollupContextHealth, rollupErrorIntel, rollupToolProfile } from "../src/dimensions.ts";
import type { SessionEntry, SessionFile, TimeRange } from "../src/types.ts";

const dayRange: TimeRange = {
	label: "today",
	since: Date.parse("2026-07-08T00:00:00.000Z"),
	until: Date.parse("2026-07-08T23:59:59.000Z"),
};

const toolResult = (timestamp: string, toolName: string, isError: boolean): SessionEntry => ({
	type: "message",
	timestamp,
	message: { role: "toolResult", toolCallId: "t1", toolName, content: [{ type: "text", text: "x" }], isError },
});

const compaction = (timestamp: string, tokensBefore: number): SessionEntry => ({
	type: "compaction",
	timestamp,
	tokensBefore,
});

const sessionA: SessionFile = {
	file: "/tmp/a.jsonl",
	header: { type: "session", id: "s1", cwd: "/repo/alpha" },
	entries: [
		{ type: "session_info", timestamp: "2026-07-08T09:00:00.000Z", name: "Alpha 任务" },
		{
			type: "message",
			timestamp: "2026-07-08T09:01:00.000Z",
			message: { role: "assistant", provider: "p1", model: "m1", content: [{ type: "text", text: "hi" }], usage: { input: 100, output: 50, cacheRead: 0, totalTokens: 150, cost: { total: 0.5 } } },
		},
		toolResult("2026-07-08T09:02:00.000Z", "bash", false),
		toolResult("2026-07-08T09:03:00.000Z", "bash", true),
		toolResult("2026-07-08T09:04:00.000Z", "edit", true),
		compaction("2026-07-08T09:05:00.000Z", 50000),
	],
	errors: [],
};

const sessionB: SessionFile = {
	file: "/tmp/b.jsonl",
	header: { type: "session", id: "s2", cwd: "/repo/beta" },
	entries: [
		{ type: "session_info", timestamp: "2026-07-08T10:00:00.000Z", name: "Beta 任务" },
		toolResult("2026-07-08T10:01:00.000Z", "read", false),
		toolResult("2026-07-08T10:02:00.000Z", "read", false),
		compaction("2026-07-08T10:03:00.000Z", 30000),
	],
	errors: [],
};

test("K1 rollupByProject 按 cwd 分组并聚合量纲", () => {
	const projects = rollupByProject([sessionA, sessionB], dayRange);
	assert.equal(projects.length, 2);
	const alpha = projects.find((p) => p.cwd === "/repo/alpha");
	assert.ok(alpha);
	assert.equal(alpha!.name, "Alpha 任务");
	assert.equal(alpha!.sessionCount, 1);
	assert.equal(alpha!.stats.totalTokens, 150);
	assert.equal(alpha!.stats.totalCost, 0.5);
	// 按 totalTokens 降序
	assert.equal(projects[0].stats.totalTokens >= projects[1].stats.totalTokens, true);
});

test("K2 rollupToolProfile 按 toolName 统计调用与错误", () => {
	const tools = rollupToolProfile([sessionA, sessionB], dayRange);
	const bash = tools.find((t) => t.name === "bash");
	assert.ok(bash);
	assert.equal(bash!.calls, 2);
	assert.equal(bash!.errors, 1);
	const read = tools.find((t) => t.name === "read");
	assert.equal(read!.calls, 2);
	assert.equal(read!.errors, 0);
	const edit = tools.find((t) => t.name === "edit");
	assert.equal(edit!.calls, 1);
	assert.equal(edit!.errors, 1);
});

test("K3 rollupErrorIntel 错误率与按工具错误来源", () => {
	const intel = rollupErrorIntel([sessionA, sessionB], dayRange);
	// toolResult 总数: 2 bash + 1 edit + 2 read = 5
	assert.equal(intel.totalToolResults, 5);
	// 错误: 1 bash + 1 edit = 2
	assert.equal(intel.errors, 2);
	assert.equal(intel.errorRate, 2 / 5);
	// byTool 只含有错误的工具，按 errors 降序
	assert.equal(intel.byTool.length, 2);
	assert.equal(intel.byTool[0].errors, 1); // bash 或 edit 都 1 个，并列
	const bashStat = intel.byTool.find((t) => t.name === "bash");
	assert.equal(bashStat!.rate, 0.5);
});

test("K5 rollupContextHealth 压缩频率与 tokensBefore", () => {
	const health = rollupContextHealth([sessionA, sessionB], dayRange);
	assert.equal(health.compactionCount, 2);
	assert.equal(health.totalTokensBefore, 80000); // 50000 + 30000
	assert.equal(health.maxTokensBefore, 50000);
	assert.equal(health.bySession.length, 2);
	// 按 tokensBefore 降序
	assert.equal(health.bySession[0].tokensBefore, 50000);
	assert.equal(health.bySession[0].name, "Alpha 任务");
});

test("多维聚合按时间范围过滤", () => {
	const outOfRange: TimeRange = { label: "other", since: Date.parse("2026-07-09T00:00:00.000Z"), until: Date.parse("2026-07-09T23:59:59.000Z") };
	const tools = rollupToolProfile([sessionA], outOfRange);
	assert.equal(tools.length, 0);
	const health = rollupContextHealth([sessionA], outOfRange);
	assert.equal(health.compactionCount, 0);
});

test("K3 零工具结果时不崩溃", () => {
	const empty: SessionFile = { file: "/tmp/e.jsonl", header: null, entries: [], errors: [] };
	const intel = rollupErrorIntel([empty], dayRange);
	assert.equal(intel.totalToolResults, 0);
	assert.equal(intel.errorRate, 0);
	assert.equal(intel.byTool.length, 0);
});
