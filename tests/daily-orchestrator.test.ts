import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyResponse, runDailyReports } from "../src/daily-orchestrator.ts";
import type { DailyReportModel, DaySummary } from "../src/types.ts";

function makeSummary(): DaySummary {
	return {
		date: "2026-07-08",
		since: 0,
		until: 1,
		stats: { totalTokens: 0, totalCost: 0, userMessages: 0, assistantMessages: 0, toolCalls: 0, toolResults: 0, inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
		sessionCount: 1,
		models: [],
		dimensions: { projects: [], tools: [], errors: { totalToolResults: 0, errors: 0, errorRate: 0, byTool: [] }, health: { compactionCount: 0, totalTokensBefore: 0, maxTokensBefore: 0, bySession: [] } },
		narrativeSource: "none",
		generatedAt: new Date().toISOString(),
	};
}

function makeReport(): DailyReportModel {
	return {
		date: "2026-07-08",
		range: { label: "2026-07-08", since: 0, until: 1 },
		generatedAt: new Date().toISOString(),
		stats: { sessionCount: 1, projectCount: 1, entryCount: 1, fileCount: 0, scanErrorCount: 0 },
		projects: [],
		tasks: [],
		completed: [],
		assistantNotes: [],
		files: [],
		toolCounts: [],
		errors: [],
		blockers: [],
		followUps: [],
		scanErrors: [],
	};
}

test("单日结果使用日报标题与归档文案", () => {
	const summary = makeSummary();
	const report = makeReport();
	const response = buildDailyResponse([{ date: "2026-07-08", markdown: "md", summary, errors: [], savedPath: "/tmp/2026-07-08.md" }], [], "zh-CN");
	assert.match(response.title, /2026-07-08/);
	assert.match(response.title, /工作日报/);
	assert.match(response.body, /已归档/);
});

test("多日结果列出日期与路径", () => {
	const summary = makeSummary();
	const report = makeReport();
	const response = buildDailyResponse(
		[
			{ date: "2026-07-08", markdown: "a", summary, errors: [], savedPath: "/tmp/2026-07-08.md" },
			{ date: "2026-07-09", markdown: "b", summary, errors: [], savedPath: "/tmp/2026-07-09.md" },
		],
		[],
		"en",
	);
	assert.match(response.body, /2026-07-08/);
	assert.match(response.body, /2026-07-09/);
	assert.match(response.title, /Multi-day session reports/);
});

test("全部失败返回失败汇总", () => {
	const response = buildDailyResponse([], [{ date: "2026-07-08", error: "EEXIST" }], "zh-CN");
	assert.match(response.title, /多天会话日报/);
	assert.match(response.body, /日报生成失败/);
	assert.match(response.body, /EEXIST/);
});

test("runDailyReports 注入依赖后单日成功返回归档报告", async () => {
	const summary = makeSummary();
	const report = makeReport();
	const response = await runDailyReports(
		"daily 2026-07-08",
		{ hasUI: false, cwd: "/tmp", model: undefined, modelRegistry: { getAvailable: () => [] } } as never,
		"zh-CN",
		{
			confirm: async () => true,
			readConfig: async () => ({ outputDir: "/tmp/reports" }),
			resolveModel: () => ({ source: "unavailable" as const }),
			scanSessions: async () => ({ sessions: [] }),
			buildDayReport: async () => ({ markdown: "# 日报", summary, errors: [] }),
			saveDailyReport: async () => ({ path: "/tmp/reports/2026-07-08.md" }),
		},
	);
	assert.match(response.title, /2026-07-08/);
	assert.match(response.body, /日报/);
	assert.match(response.body, /已归档/);
});

test("runDailyReports 多日确认取消返回取消文案", async () => {
	const response = await runDailyReports(
		"daily 2026-07-08 到 2026-07-09",
		{ hasUI: true, ui: { confirm: async () => false }, cwd: "/tmp", model: undefined, modelRegistry: { getAvailable: () => [] } } as never,
		"zh-CN",
		{
			confirm: async () => false,
			readConfig: async () => ({ outputDir: "/tmp/reports" }),
			resolveModel: () => ({ source: "unavailable" as const }),
			scanSessions: async () => ({ sessions: [] }),
			buildDayReport: async () => ({ markdown: "", summary: makeSummary(), errors: [] }),
			saveDailyReport: async () => ({ path: "" }),
		},
	);
	assert.match(response.title, /多天会话日报/);
	assert.match(response.body, /已取消/);
});

test("runDailyReports 部分失败仍返回成功与失败列表", async () => {
	const summary = makeSummary();
	const response = await runDailyReports(
		"daily 2026-07-08 到 2026-07-10",
		{ hasUI: false, cwd: "/tmp", model: undefined, modelRegistry: { getAvailable: () => [] } } as never,
		"zh-CN",
		{
			confirm: async () => true,
			readConfig: async () => ({ outputDir: "/tmp/reports" }),
			resolveModel: () => ({ source: "unavailable" as const }),
			scanSessions: async () => ({ sessions: [] }),
			buildDayReport: async () => ({ markdown: "# ok", summary, errors: [] }),
			saveDailyReport: async (date) => {
				if (date === "2026-07-09") throw new Error("boom");
				return { path: `/tmp/reports/${date}.md` };
			},
		},
	);
	assert.match(response.body, /2026-07-08/);
	assert.match(response.body, /2026-07-10/);
	assert.match(response.body, /boom/);
});
