// 今日差异 diff（task 19）。纯算法，读"今天 DaySummary + 近 N 天 DaySummary"算差异，不额外烧 LLM。
// 维度：消耗趋势（token/cost ↑↓→）/ 新增项目 / 今天未出现的历史常见项目 / 工具画像变化 / 异常点（错误率突增、压缩频繁）。

import { formatNumber } from "./format.ts";
import type { DaySummary, UiLocale } from "./types.ts";

export interface TrendPoint {
	today: number;
	historyAvg: number;
	direction: "up" | "down" | "flat";
}

export interface DayDiff {
	tokenTrend: TrendPoint;
	costTrend: TrendPoint;
	newProjects: string[];
	missingProjects: string[];
	toolShift: { today: string; history: string; changed: boolean };
	anomalies: string[];
}

function trendDirection(today: number, avg: number): "up" | "down" | "flat" {
	if (avg === 0) return today > 0 ? "up" : "flat";
	const ratio = today / avg;
	if (ratio >= 1.1) return "up";
	if (ratio <= 0.9) return "down";
	return "flat";
}

function avg(nums: number[]): number {
	if (nums.length === 0) return 0;
	return nums.reduce((sum, n) => sum + n, 0) / nums.length;
}

export function computeDayDiff(today: DaySummary, history: DaySummary[]): DayDiff {
	const tokenAvg = avg(history.map((h) => h.stats.totalTokens));
	const costAvg = avg(history.map((h) => h.stats.totalCost));

	// 项目集合对比
	const todayProjects = new Set(today.dimensions.projects.map((p) => p.name));
	const historyProjectCounts = new Map<string, number>();
	for (const h of history) {
		for (const p of h.dimensions.projects) {
			historyProjectCounts.set(p.name, (historyProjectCounts.get(p.name) ?? 0) + 1);
		}
	}
	const historyProjectNames = new Set(historyProjectCounts.keys());
	const newProjects = [...todayProjects].filter((name) => !historyProjectNames.has(name));
	// 消失：历史频繁出现（>= 一半天数）但今天没有
	const halfHistory = history.length / 2;
	const missingProjects = [...historyProjectCounts.entries()]
		.filter(([, count]) => count >= halfHistory)
		.map(([name]) => name)
		.filter((name) => !todayProjects.has(name));

	// 工具 top1 对比
	const todayTopTool = today.dimensions.tools[0]?.name ?? "";
	const historyToolCounts = new Map<string, number>();
	for (const h of history) {
		for (const t of h.dimensions.tools) {
			historyToolCounts.set(t.name, (historyToolCounts.get(t.name) ?? 0) + t.calls);
		}
	}
	const historyTopTool = [...historyToolCounts.entries()].sort((left, right) => right[1] - left[1])[0]?.[0] ?? "";
	const toolShift = {
		today: todayTopTool,
		history: historyTopTool,
		changed: todayTopTool !== "" && historyTopTool !== "" && todayTopTool !== historyTopTool,
	};

	// 异常点
	const anomalies: string[] = [];
	const todayErrRate = today.dimensions.errors.errorRate;
	const historyErrAvg = avg(history.map((h) => h.dimensions.errors.errorRate));
	if (todayErrRate > 0.05 && todayErrRate > historyErrAvg * 2) {
		anomalies.push(`错误率突增：今天 ${(todayErrRate * 100).toFixed(1)}% vs 历史均值 ${(historyErrAvg * 100).toFixed(1)}%`);
	}
	const todayComp = today.dimensions.health.compactionCount;
	const historyCompAvg = avg(history.map((h) => h.dimensions.health.compactionCount));
	if (todayComp > 0 && historyCompAvg > 0 && todayComp > historyCompAvg * 2) {
		anomalies.push(`压缩频繁：今天 ${todayComp} 次 vs 历史均值 ${historyCompAvg.toFixed(1)} 次`);
	}

	return {
		tokenTrend: { today: today.stats.totalTokens, historyAvg: tokenAvg, direction: trendDirection(today.stats.totalTokens, tokenAvg) },
		costTrend: { today: today.stats.totalCost, historyAvg: costAvg, direction: trendDirection(today.stats.totalCost, costAvg) },
		newProjects,
		missingProjects,
		toolShift,
		anomalies,
	};
}

const arrow = (direction: "up" | "down" | "flat"): string => (direction === "up" ? "↑" : direction === "down" ? "↓" : "→");

export function renderDayDiff(diff: DayDiff, locale: UiLocale): string[] {
	const lines: string[] = ["## 差异", ""];
	lines.push(`- token：${formatNumber(diff.tokenTrend.today, locale)} ${arrow(diff.tokenTrend.direction)} 历史均值 ${formatNumber(diff.tokenTrend.historyAvg, locale)}`);
	lines.push(`- 费用：$${diff.costTrend.today.toFixed(4)} ${arrow(diff.costTrend.direction)} 历史均值 $${diff.costTrend.historyAvg.toFixed(4)}`);
	if (diff.newProjects.length > 0) lines.push(`- 新增项目：${diff.newProjects.join("、")}`);
	if (diff.missingProjects.length > 0) lines.push(`- 今天未出现（历史常见）：${diff.missingProjects.join("、")}`);
	if (diff.toolShift.changed) lines.push(`- 工具画像变化：今天 ${diff.toolShift.today}-heavy，平时 ${diff.toolShift.history}-heavy`);
	for (const anomaly of diff.anomalies) lines.push(`- ⚠️ ${anomaly}`);
	lines.push("");
	return lines;
}
