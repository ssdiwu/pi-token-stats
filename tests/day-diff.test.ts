// 今日差异 diff 单元测试（task 20）。computeDayDiff 纯算法，手造 DaySummary 样本。

import assert from "node:assert/strict";
import test from "node:test";

import { computeDayDiff, renderDayDiff } from "../src/day-diff.ts";
import { emptyStats } from "../src/usage-rollup.ts";
import type { DaySummary } from "../src/types.ts";

function makeSummary(date: string, opts: { tokens?: number; cost?: number; projects?: string[]; tools?: Array<[string, number, number?]>; errTotal?: number; errErrors?: number; compactions?: number }): DaySummary {
	const errErrors = opts.errErrors ?? 0;
	const errTotal = opts.errTotal ?? 0;
	return {
		date,
		since: 0,
		until: 0,
		stats: { ...emptyStats(), totalTokens: opts.tokens ?? 0, totalCost: opts.cost ?? 0 },
		sessionCount: 1,
		models: [],
		dimensions: {
			projects: (opts.projects ?? []).map((name) => ({ cwd: name, name, sessionCount: 1, stats: { ...emptyStats() } })),
			tools: (opts.tools ?? []).map(([name, calls, errors]) => ({ name, calls, errors: errors ?? 0 })),
			errors: { totalToolResults: errTotal, errors: errErrors, errorRate: errTotal > 0 ? errErrors / errTotal : 0, byTool: [] },
			health: { compactionCount: opts.compactions ?? 0, totalTokensBefore: 0, maxTokensBefore: 0, bySession: [] },
		},
		narrativeSource: "none",
		generatedAt: date,
	};
}

test("tokenTrend 今天高于历史均值 → up", () => {
	const today = makeSummary("2026-07-08", { tokens: 200 });
	const history = [makeSummary("2026-07-07", { tokens: 100 }), makeSummary("2026-07-06", { tokens: 100 })];
	const diff = computeDayDiff(today, history);
	assert.equal(diff.tokenTrend.today, 200);
	assert.equal(diff.tokenTrend.historyAvg, 100);
	assert.equal(diff.tokenTrend.direction, "up");
});

test("tokenTrend 今天低于历史均值 → down", () => {
	const today = makeSummary("2026-07-08", { tokens: 50 });
	const history = [makeSummary("2026-07-07", { tokens: 100 })];
	assert.equal(computeDayDiff(today, history).tokenTrend.direction, "down");
});

test("newProjects 今天有历史没有", () => {
	const today = makeSummary("2026-07-08", { projects: ["Alpha", "新项目"] });
	const history = [makeSummary("2026-07-07", { projects: ["Alpha", "Beta"] })];
	const diff = computeDayDiff(today, history);
	assert.deepEqual(diff.newProjects, ["新项目"]);
});

test("missingProjects 历史频繁但今天没有", () => {
	const today = makeSummary("2026-07-08", { projects: ["Alpha"] });
	// 历史两天都有 Beta（>= halfHistory=1），今天没有
	const history = [makeSummary("2026-07-07", { projects: ["Alpha", "Beta"] }), makeSummary("2026-07-06", { projects: ["Beta"] })];
	const diff = computeDayDiff(today, history);
	assert.ok(diff.missingProjects.includes("Beta"));
});

test("toolShift top 工具不同 → changed", () => {
	const today = makeSummary("2026-07-08", { tools: [["bash", 10], ["read", 5]] });
	const history = [makeSummary("2026-07-07", { tools: [["read", 20], ["bash", 5]] })];
	const diff = computeDayDiff(today, history);
	assert.equal(diff.toolShift.today, "bash");
	assert.equal(diff.toolShift.history, "read");
	assert.equal(diff.toolShift.changed, true);
});

test("anomalies 错误率突增", () => {
	const today = makeSummary("2026-07-08", { errTotal: 100, errErrors: 20 }); // 20%
	const history = [makeSummary("2026-07-07", { errTotal: 100, errErrors: 5 })]; // 5%
	const diff = computeDayDiff(today, history);
	assert.ok(diff.anomalies.length > 0);
	assert.ok(diff.anomalies.some((a) => a.includes("错误率突增")));
});

test("anomalies 压缩频繁", () => {
	const today = makeSummary("2026-07-08", { compactions: 6 });
	const history = [makeSummary("2026-07-07", { compactions: 2 }), makeSummary("2026-07-06", { compactions: 2 })];
	const diff = computeDayDiff(today, history);
	assert.ok(diff.anomalies.some((a) => a.includes("压缩频繁")));
});

test("renderDayDiff 输出含趋势箭头与项目", () => {
	const today = makeSummary("2026-07-08", { tokens: 200, projects: ["新项目"] });
	const history = [makeSummary("2026-07-07", { tokens: 100 })];
	const diff = computeDayDiff(today, history);
	const lines = renderDayDiff(diff, "zh-CN");
	const text = lines.join("\n");
	assert.ok(text.includes("差异"));
	assert.ok(text.includes("↑"));
	assert.ok(text.includes("新项目"));
});

test("空历史不崩溃", () => {
	const today = makeSummary("2026-07-08", { tokens: 100 });
	const diff = computeDayDiff(today, []);
	assert.equal(diff.tokenTrend.direction, "up"); // avg 0, today>0 → up
	assert.equal(diff.newProjects.length, 0);
});
