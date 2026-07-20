// pi-session-insights — Pi 会话信息拓展入口。
// 注册 /insights 命令和 insights tool：量纲聚合 + 多维分析 + 叙事日报 + 配置化归档 + L2 面板。

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";

import { resolveUiLocale, t } from "./src/locale.ts";
import { buildInteractiveReport, buildReportForRequest } from "./src/insights.ts";
import { parseDailyCommand, buildDailyRequest, type DailyToolParams } from "./src/daily-command.ts";
import { runDailyReports } from "./src/daily-orchestrator.ts";
import { loadInsightsPanelData } from "./src/panel-data.ts";
import { InsightsPanel } from "./src/panel.ts";
import type { UiLocale } from "./src/types.ts";

const InsightsParams = Type.Object({
	range: Type.Optional(Type.String({ description: "Natural-language range, e.g. 今天, 最近5小时, 本周, 最近一周, 昨天到今天" })),
	since: Type.Optional(Type.String({ description: "Absolute local start time, e.g. 2026-06-18 00:00:00" })),
	until: Type.Optional(Type.String({ description: "Absolute local end time, e.g. 2026-06-19 03:50:57" })),
	label: Type.Optional(Type.String({ description: "Display label for the selected range, e.g. 昨天到今天" })),
});

const DailyParams = Type.Object({
	date: Type.Optional(Type.String({ description: "Single day for the report, e.g. 2026-06-17" })),
	range: Type.Optional(Type.String({ description: "Natural-language range, e.g. 昨天, 本周, 2026-06-10 到 2026-06-17" })),
	projectCurrent: Type.Optional(Type.Boolean({ description: "Limit the report to the current project (cwd)" })),
	dayStart: Type.Optional(Type.String({ description: "Custom day boundary HH:mm, e.g. 03:00 (cannot combine with date or range)" })),
});

function renderInsightsResult(result: { content?: Array<{ type?: string; text?: string }> }, options: { expanded: boolean; isPartial: boolean }, theme: any): Text {
	if (options.isPartial) return new Text(theme.fg("warning", "正在生成会话洞察..."), 0, 0);
	const text = result.content?.find((item) => item.type === "text")?.text ?? "";
	if (options.expanded) return new Text(theme.fg("toolOutput", text), 0, 0);
	const title = text.split("\n", 1)[0] || "Session insights";
	return new Text(theme.fg("success", `${title} (Ctrl+O to expand)`), 0, 0);
}

function renderDailyResult(result: { content?: Array<{ type?: string; text?: string }> }, options: { expanded: boolean; isPartial: boolean }, theme: any): Text {
	if (options.isPartial) return new Text(theme.fg("warning", "正在生成日报..."), 0, 0);
	const text = result.content?.find((item) => item.type === "text")?.text ?? "";
	if (options.expanded) return new Text(theme.fg("toolOutput", text), 0, 0);
	const title = text.split("\n", 1)[0] || "Daily report";
	return new Text(theme.fg("success", `${title} (Ctrl+O to expand)`), 0, 0);
}

async function showDialog(ctx: ExtensionCommandContext | ExtensionContext, title: string, body: string, locale: UiLocale): Promise<void> {
	// print 模式纯文本；TUI 带参数路径走原生 select/input（无参数 TUI 走 L2 面板，见 showInsightsPanel）。
	if (!ctx.hasUI || ctx.mode !== "tui") {
		console.log(`${title}\n\n${body}`);
		return;
	}

	let currentTitle = title;
	let currentBody = body;
	for (;;) {
		const inputChoice = t(locale, "choiceInput");
		const choice = await ctx.ui.select(`${currentTitle}\n\n${currentBody}`, [inputChoice, t(locale, "choiceExit")]);
		if (choice !== inputChoice) return;

		const range = await ctx.ui.input(t(locale, "inputRange"), t(locale, "inputPlaceholder"));
		if (!range?.trim()) return;
		const report = await buildInteractiveReport(range, ctx, locale);
		currentTitle = report.title;
		currentBody = report.body;
	}
}

async function showInsightsPanel(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<void> {
	const now = new Date();
	await ctx.ui.custom<undefined>((tui, theme, keybindings, done) => new InsightsPanel({
		load: () => loadInsightsPanelData(locale, now),
		loadingTitle: t(locale, "title", { range: t(locale, "rangeToday") }),
		loadingBody: t(locale, "panelLoading"),
		errorTitle: t(locale, "title", { range: t(locale, "rangeToday") }),
		errorBody: (message) => t(locale, "panelLoadFailed", { message }),
	}, tui, theme, () => done(undefined)), { overlay: true });
}

async function showReport(ctx: ExtensionCommandContext | ExtensionContext, title: string, body: string, locale: UiLocale): Promise<void> {
	if (!ctx.hasUI || ctx.mode !== "tui") {
		console.log(`${title}\n\n${body}`);
		return;
	}
	await ctx.ui.select(`${title}\n\n${body}`, [t(locale, "choiceExit")]);
}

export default function sessionInsightsExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "insights",
		label: "Session Insights",
		description: "Read Pi session usage for a time range. Prefer structured since/until absolute times when the range is already understood.",
		promptSnippet: "Read Pi session usage when the user asks about token/cost consumption for a time range.",
		promptGuidelines: [
			"Use insights when the user asks about Pi token usage, cost, or session consumption in natural language.",
			"Prefer passing insights.since and insights.until as absolute local timestamps plus insights.label when you can infer the exact range.",
			"Use insights.range for current session requests or when you need the extension's built-in fallback parsing.",
			"If the user does not specify a time range, use insights with no range; it defaults to today.",
			"Do not use insights to generate daily reports; call daily once with the full date range instead.",
		],
		parameters: InsightsParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const locale = resolveUiLocale(pi, ctx);
			const report = await buildReportForRequest(params, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
			return {
				content: [{ type: "text", text: `${report.title}\n\n${report.body}` }],
				details: { stats: report.stats, sessions: report.sessions.length, models: report.models, locale },
			};
		},
		renderResult(result, options, theme) {
			return renderInsightsResult(result, options, theme);
		},
	});

	pi.registerCommand("insights", {
		description: "Show Pi session insights. Defaults to today; free-form time input is resolved by the current model first, then by built-in fallback rules.",
		handler: async (args, ctx) => {
			const locale = resolveUiLocale(pi, ctx);
			const raw = args?.trim();
			// 无参数 + TUI：打开 L2 overlay 面板（数字视图 / 日报视图切换）
			if (!raw && ctx.hasUI && ctx.mode === "tui") {
				await showInsightsPanel(ctx, locale);
				return;
			}
			const report = await buildInteractiveReport(args, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
		},
	});

	pi.registerTool({
		name: "daily",
		label: "Daily Report",
		description: "Generate a project-grouped daily work report for a date or range and archive it to disk. Defaults to today.",
		promptSnippet: "Generate a project-grouped daily report summarizing the day's work",
		promptGuidelines: [
			"Use daily when the user asks to generate a daily report, summarize the day's work, or write up what happened today or on a specific date.",
			"Pass daily.date as YYYY-MM-DD for a specific day, or daily.range for a natural-language range like 本周; omit both for today.",
			"Set daily.projectCurrent to true to limit the report to the current project.",
			"For multiple days, pass one range; daily archives one file per day and returns only a batch summary.",
		],
		parameters: DailyParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const locale = resolveUiLocale(pi, ctx);
			const report = await runDailyReports(buildDailyRequest(params as DailyToolParams), ctx, locale);
			return {
				content: [{ type: "text", text: `${report.title}\n\n${report.body}` }],
				details: { locale, projectCurrent: params.projectCurrent },
			};
		},
		renderResult(result, options, theme) {
			return renderDailyResult(result, options, theme);
		},
	});

	pi.registerCommand("daily", {
		description: "Generate a project-grouped daily work report and archive it. Defaults to today; supports a date, range, --day-start HH:mm and --project current.",
		handler: async (args, ctx) => {
			const locale = resolveUiLocale(pi, ctx);
			const request = parseDailyCommand(args ?? "");
			const report = await runDailyReports(request, ctx, locale);
			await showReport(ctx, report.title, report.body, locale);
		},
	});
}
