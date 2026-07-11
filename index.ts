// pi-session-insights — Pi 会话信息拓展入口。
// 注册 /insights 命令和 insights tool：量纲聚合 + 多维分析 + 叙事日报 + 配置化归档 + L2 面板。

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

import { resolveUiLocale, t } from "./src/locale.ts";
import { buildInteractiveReport, buildReportForRequest } from "./src/insights.ts";
import { loadInsightsPanelData } from "./src/panel-data.ts";
import { InsightsPanel } from "./src/panel.ts";
import type { UiLocale } from "./src/types.ts";

const InsightsParams = Type.Object({
	range: Type.Optional(Type.String({ description: "Natural-language range, e.g. 今天, 最近5小时, 本周, 最近一周, 昨天到今天" })),
	since: Type.Optional(Type.String({ description: "Absolute local start time, e.g. 2026-06-18 00:00:00" })),
	until: Type.Optional(Type.String({ description: "Absolute local end time, e.g. 2026-06-19 03:50:57" })),
	label: Type.Optional(Type.String({ description: "Display label for the selected range, e.g. 昨天到今天" })),
});

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
}
