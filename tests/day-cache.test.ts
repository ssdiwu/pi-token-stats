// 按天缓存 + 叙事生成单元测试（task 16）。
// 缓存读写用临时 homeDir，不污染真实 ~/.pi；LLM 只测回退路径（不传 ctx）。

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { buildDayDeterministic, dayFilePath, ensureDaySummary, localDayRange, readDaySummary, writeDaySummary } from "../src/day-cache.ts";
import type { SessionEntry, SessionFile } from "../src/types.ts";

const tmpHome = path.join(os.tmpdir(), `psi-test-${Date.now()}-${process.pid}`);

before(async () => {
	await fs.mkdir(tmpHome, { recursive: true });
});

after(async () => {
	await fs.rm(tmpHome, { recursive: true, force: true });
});

const DATE = "2026-07-08";

const toolResult = (timestamp: string, toolName: string, isError: boolean): SessionEntry => ({
	type: "message",
	timestamp,
	message: { role: "toolResult", toolCallId: "t1", toolName, content: [{ type: "text", text: "x" }], isError },
});

const sampleSession: SessionFile = {
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
	],
	errors: [],
};

test("localDayRange 使用次日 00:00 作为半开区间终点", () => {
	const range = localDayRange(DATE);
	assert.equal(range.since, new Date(2026, 6, 8, 0, 0, 0, 0).getTime());
	assert.equal(range.until, new Date(2026, 6, 9, 0, 0, 0, 0).getTime());
});

test("buildDayDeterministic 纯算法聚合当天量纲与多维", () => {
	const summary = buildDayDeterministic(DATE, [sampleSession]);
	assert.equal(summary.date, DATE);
	assert.equal(summary.sessionCount, 1);
	assert.equal(summary.stats.totalTokens, 150);
	assert.equal(summary.stats.totalCost, 0.5);
	assert.equal(summary.dimensions.tools.length, 1); // bash
	assert.equal(summary.dimensions.errors.errors, 1);
	assert.equal(summary.narrativeSource, "none");
});

test("writeDaySummary + readDaySummary 幂等往返", async () => {
	const summary = buildDayDeterministic(DATE, [sampleSession]);
	await writeDaySummary(summary, tmpHome);
	const file = dayFilePath(DATE, tmpHome);
	assert.ok(await fs.access(file).then(() => true).catch(() => false), "缓存文件已创建");

	const readBack = await readDaySummary(DATE, tmpHome);
	assert.ok(readBack);
	assert.equal(readBack!.date, DATE);
	assert.equal(readBack!.stats.totalTokens, 150);
});

test("ensureDaySummary 缓存命中（第二次读不重算）", async () => {
	const first = await ensureDaySummary(DATE, [sampleSession], tmpHome);
	assert.equal(first.stats.totalTokens, 150);

	// 改 sessions（加一个会话），但缓存应命中，返回旧值
	const bigger = await ensureDaySummary(DATE, [sampleSession, { ...sampleSession, file: "/tmp/b.jsonl" }], tmpHome);
	assert.equal(bigger.stats.totalTokens, 150, "缓存命中，未重算");
	assert.equal(bigger.sessionCount, 1, "仍是缓存的 1 会话");
});

test("readDaySummary 缺失返回 null", async () => {
	const missing = await readDaySummary("2099-01-01", tmpHome);
	assert.equal(missing, null);
});
