// K0 量纲聚合单元测试（手造 session 样本，对标 daily tests/report.test.ts 风格）。
// 纯函数测试，不 mock 系统，不读真实会话文件。

import assert from "node:assert/strict";
import test from "node:test";

import { messageTotal, rollupEntries, rollupSessions } from "../src/usage-rollup.ts";
import type { SessionEntry, SessionFile, TimeRange } from "../src/types.ts";

const userEntry = (timestamp: string): SessionEntry => ({
	type: "message",
	timestamp,
	message: { role: "user", content: [{ type: "text", text: "hello" }] },
});

const assistantEntry = (timestamp: string, usage: unknown, provider = "testprov", model = "testmodel"): SessionEntry => ({
	type: "message",
	timestamp,
	message: {
		role: "assistant",
		provider,
		model,
		content: [{ type: "text", text: "hi" }, { type: "toolCall", id: "t1", name: "bash", arguments: {} }],
		usage,
	},
});

const toolResultEntry = (timestamp: string): SessionEntry => ({
	type: "message",
	timestamp,
	message: { role: "toolResult", toolCallId: "t1", toolName: "bash", content: [{ type: "text", text: "done" }], isError: false },
});

const usage = (input: number, output: number, cacheRead = 0, cost = 0) => ({
	input,
	output,
	cacheRead,
	cacheWrite: 0,
	totalTokens: input + output + cacheRead,
	cost: { total: cost },
});

const sessionA: SessionFile = {
	file: "/tmp/session-a.jsonl",
	header: { type: "session", id: "s1", cwd: "/repo/alpha" },
	entries: [
		userEntry("2026-07-08T09:00:00.000Z"),
		assistantEntry("2026-07-08T09:01:00.000Z", usage(100, 50, 200, 0.5)),
		toolResultEntry("2026-07-08T09:02:00.000Z"),
		{ type: "session_info", timestamp: "2026-07-08T09:00:00.000Z", name: "Alpha 任务" },
	],
	errors: [],
};

const sessionB: SessionFile = {
	file: "/tmp/session-b.jsonl",
	header: { type: "session", id: "s2", cwd: "/repo/beta" },
	entries: [
		userEntry("2026-07-08T10:00:00.000Z"),
		assistantEntry("2026-07-08T10:01:00.000Z", usage(80, 40, 100, 0.3), "otherprov", "othermodel"),
	],
	errors: [],
};

const dayRange: TimeRange = {
	label: "today",
	since: Date.parse("2026-07-08T00:00:00.000Z"),
	until: Date.parse("2026-07-08T23:59:59.000Z"),
};

test("rollupEntries 聚合单会话量纲", () => {
	const { stats, models } = rollupEntries(sessionA.entries);
	assert.equal(stats.userMessages, 1);
	assert.equal(stats.assistantMessages, 1);
	assert.equal(stats.toolResults, 1);
	assert.equal(stats.toolCalls, 1); // assistant content 里 1 个 toolCall block
	assert.equal(stats.inputTokens, 100);
	assert.equal(stats.outputTokens, 50);
	assert.equal(stats.cacheReadTokens, 200);
	assert.equal(stats.totalTokens, 350);
	assert.equal(stats.totalCost, 0.5);
	assert.equal(models.length, 1);
	assert.equal(models[0].provider, "testprov");
	assert.equal(models[0].model, "testmodel");
});

test("rollupEntries 按时间范围过滤", () => {
	const outOfRange: TimeRange = { label: "other", since: Date.parse("2026-07-09T00:00:00.000Z"), until: Date.parse("2026-07-09T23:59:59.000Z") };
	const { stats } = rollupEntries(sessionA.entries, outOfRange);
	assert.equal(stats.userMessages, 0);
	assert.equal(stats.totalTokens, 0);
});

test("rollupSessions 多会话聚合 + 模型分组", () => {
	const { stats, models, sessions } = rollupSessions([sessionA, sessionB], dayRange);
	assert.equal(sessions.length, 2);
	assert.equal(stats.userMessages, 2);
	assert.equal(stats.assistantMessages, 2);
	assert.equal(stats.inputTokens, 180); // 100 + 80
	assert.equal(stats.outputTokens, 90); // 50 + 40
	assert.equal(stats.totalCost, 0.8); // 0.5 + 0.3
	// 两个不同 provider/model 应分开
	assert.equal(models.length, 2);
	const providers = models.map((m) => `${m.provider}/${m.model}`).sort();
	assert.deepEqual(providers, ["otherprov/othermodel", "testprov/testmodel"]);
});

test("rollupSessions 跳过空会话", () => {
	const empty: SessionFile = { file: "/tmp/empty.jsonl", header: null, entries: [], errors: [] };
	const { sessions } = rollupSessions([sessionA, empty], dayRange);
	assert.equal(sessions.length, 1);
});

test("rollupSessions 携带 cwd 与 session_info name", () => {
	const { sessions } = rollupSessions([sessionA], dayRange);
	assert.equal(sessions[0].cwd, "/repo/alpha");
	assert.equal(sessions[0].name, "Alpha 任务");
});

test("messageTotal 汇总消息数", () => {
	assert.equal(messageTotal({ userMessages: 2, assistantMessages: 3, toolResults: 1 } as any), 6);
});
