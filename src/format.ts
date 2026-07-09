// 格式化与渲染层（迁移自 token-stats + 扩展多维渲染）。
// print 模式纯文本输出；TUI 面板留后续 phase（L2 overlay）。

import { t } from "./locale.ts";
import { messageTotal } from "./usage-rollup.ts";
import type { Dimensions, ModelRollup, Report, SessionRollup, TimeRange, TokenStats, UiLocale } from "./types.ts";

export function formatNumber(value: number, locale: UiLocale): string {
	return Math.round(value).toLocaleString(locale);
}

export function formatCost(value: number): string {
	return value.toFixed(4);
}

export function formatTime(value: number, locale: UiLocale): string {
	return new Date(value).toLocaleString(locale);
}

function formatDimensions(dimensions: Dimensions, locale: UiLocale): string[] {
	const lines: string[] = [];

	// K1 项目排行
	const topProjects = dimensions.projects.slice(0, 5);
	if (topProjects.length > 0) {
		lines.push("", t(locale, "projects", { count: topProjects.length }));
		for (const [index, project] of topProjects.entries()) {
			lines.push(`${index + 1}. ${project.name} (${project.sessionCount} sess): ${formatNumber(project.stats.totalTokens, locale)} / ${formatCost(project.stats.totalCost)}`);
		}
	}

	// K2 工具画像
	const topTools = dimensions.tools.slice(0, 5);
	if (topTools.length > 0) {
		lines.push("", t(locale, "toolsProfile", { count: topTools.length }));
		for (const [index, tool] of topTools.entries()) {
			lines.push(`${index + 1}. ${tool.name}: ${formatNumber(tool.calls, locale)}${tool.errors > 0 ? ` (err ${tool.errors})` : ""}`);
		}
	}

	// K3 错误情报
	if (dimensions.errors.totalToolResults > 0) {
		const top = dimensions.errors.byTool[0];
		lines.push("", t(locale, "errorsIntel", {
			rate: (dimensions.errors.errorRate * 100).toFixed(1),
			errors: dimensions.errors.errors,
			total: dimensions.errors.totalToolResults,
			top: top ? `${top.name} ${top.errors}` : "-",
		}));
	}

	// K5 上下文健康
	if (dimensions.health.compactionCount > 0) {
		lines.push("", t(locale, "healthFacts", {
			count: dimensions.health.compactionCount,
			max: formatNumber(dimensions.health.maxTokensBefore, locale),
		}));
	}

	return lines;
}

export function formatDialogBody(range: TimeRange | undefined, stats: TokenStats, sessions: SessionRollup[], models: ModelRollup[], locale: UiLocale, dimensions?: Dimensions): string {
	const lines = [
		...(range ? [t(locale, "range", { since: formatTime(range.since, locale), until: formatTime(range.until, locale) }), t(locale, "sessions", { count: formatNumber(sessions.length, locale) })] : []),
		t(locale, "messages", {
			total: formatNumber(messageTotal(stats), locale),
			users: formatNumber(stats.userMessages, locale),
			assistants: formatNumber(stats.assistantMessages, locale),
			tools: formatNumber(stats.toolCalls, locale),
		}),
		t(locale, "tokens", { total: formatNumber(stats.totalTokens, locale) }),
		t(locale, "tokenBreakdown", {
			input: formatNumber(stats.inputTokens, locale),
			output: formatNumber(stats.outputTokens, locale),
			cache: formatNumber(stats.cacheReadTokens, locale),
		}),
		t(locale, "cost", { cost: formatCost(stats.totalCost) }),
	];

	const topModels = models.slice(0, 5);
	if (topModels.length > 0) {
		lines.push("", t(locale, "models"));
		for (const [index, item] of topModels.entries()) {
			lines.push(`${index + 1}. ${item.provider}/${item.model}: ${formatNumber(item.stats.totalTokens, locale)} / ${formatCost(item.stats.totalCost)}`);
		}
		if (models.length > topModels.length) lines.push(t(locale, "moreModels", { count: models.length - topModels.length }));
	}

	const topSessions = sessions
		.filter((session) => session.stats.totalTokens > 0 || session.stats.totalCost > 0)
		.sort((left, right) => right.stats.totalTokens - left.stats.totalTokens)
		.slice(0, 3);
	if (topSessions.length > 0) {
		lines.push("", t(locale, "topSessions"));
		for (const [index, session] of topSessions.entries()) {
			lines.push(`${index + 1}. ${session.name}: ${formatNumber(session.stats.totalTokens, locale)} / ${formatCost(session.stats.totalCost)}`);
		}
	}

	if (dimensions) lines.push(...formatDimensions(dimensions, locale));

	return lines.join("\n");
}

export function buildReport(title: string, range: TimeRange | undefined, stats: TokenStats, sessions: SessionRollup[], models: ModelRollup[], locale: UiLocale, dimensions?: Dimensions): Report {
	return { title, body: formatDialogBody(range, stats, sessions, models, locale, dimensions), stats, sessions, models, dimensions };
}
