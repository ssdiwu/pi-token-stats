// 命令主逻辑（组装扫描 → 聚合 → 渲染）。
// buildRangeReport 异步扫描所有会话再聚合；buildSessionReport 只看当前会话分支。
// LLM 时间解析优先，失败回退本地规则。

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { t } from "./locale.ts";
import { rollupEntries, rollupSessions } from "./usage-rollup.ts";
import { isSessionRange, parseRange, parseRangeRequest, resolveRangeWithLlm } from "./time-range.ts";
import { rollupDimensions } from "./dimensions.ts";
import { buildReport, formatDialogBody } from "./format.ts";
import { buildDayReport } from "./day-report.ts";
import { saveDayReportToVault } from "./obsidian-sync.ts";
import { scanSessions } from "./session-scan.ts";
import type { Report, RangeRequest, TimeRange, UiLocale } from "./types.ts";

function buildRangeReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], range: TimeRange, locale: UiLocale): Report {
	const { stats, models, sessions: sessionRollups } = rollupSessions(sessions, range);
	const dimensions = rollupDimensions(sessions, range);
	return buildReport(t(locale, "title", { range: range.label }), range, stats, sessionRollups, models, locale, dimensions);
}

export async function buildRangeReport(range: TimeRange, locale: UiLocale): Promise<Report> {
	const { sessions } = await scanSessions();
	return buildRangeReportFromSessions(sessions, range, locale);
}

export function buildSessionReport(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Report {
	const { stats, models } = rollupEntries(ctx.sessionManager.getBranch());
	const name = ctx.sessionManager.getSessionName?.() ?? ctx.sessionManager.getSessionId?.() ?? t(locale, "currentSession");
	return {
		title: t(locale, "title", { range: name }),
		body: formatDialogBody(undefined, stats, [], models, locale),
		stats,
		sessions: [],
		models,
	};
}

export async function buildReportForRequest(request: RangeRequest | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const range = parseRangeRequest(request, locale);
	return range === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(range, locale);
}

export async function buildInteractiveReport(rangeText: string | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const raw = rangeText?.trim();
	if (!raw) return buildRangeReport(parseRange(undefined, locale) as TimeRange, locale);
	if (isDayReportRequest(raw)) return buildDayReportCommand(ctx, locale);
	if (isSessionRange(raw)) return buildSessionReport(ctx, locale);

	const llmRange = await resolveRangeWithLlm(raw, ctx);
	if (llmRange === "session") return buildSessionReport(ctx, locale);
	if (llmRange) return buildRangeReport(llmRange, locale);
	const fallback = parseRange(raw, locale);
	return fallback === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(fallback, locale);
}

export function buildTodayReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], locale: UiLocale, now = new Date()): Report {
	const range = parseRange(undefined, locale, now) as TimeRange;
	return buildRangeReportFromSessions(sessions, range, locale);
}

export function isDayReportRequest(value: string | undefined): boolean {
	const raw = value?.trim().toLowerCase();
	if (!raw) return false;
	return ["daily", "日报", "日報", "report", "today report"].includes(raw);
}

export function localDateString(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

async function buildDayReportCommand(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const { sessions } = await scanSessions();
	const today = localDateString();
	const { markdown, summary } = await buildDayReport(today, sessions, locale, { ctx });

	// 自动沉淀到 Obsidian：探测 open:true vault，写 <vault>/<子目录>/YYYY-MM-DD.md。
	let body = markdown;
	try {
		const saved = await saveDayReportToVault(today, markdown);
		body = `${markdown}\n\n---\n已沉淀到 Obsidian：${saved.path}${saved.overwritten ? "（覆盖）" : ""}\n`;
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		body = `${markdown}\n\n---\n⚠️ Obsidian 沉淀失败：${message}\n`;
	}

	return { title: `${today} 会话日报`, body, stats: summary.stats, sessions: [], models: summary.models };
}
