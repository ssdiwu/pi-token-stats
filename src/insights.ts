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
import { saveDailyReport } from "./daily-archive.ts";
import { readDailyConfig, selectDailyModel } from "./daily-config.ts";
import { isDailyCommand, parseDailyCommand, resolveDailyCommandWindows } from "./daily-command.ts";
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
	if (isDayReportRequest(raw)) return buildDayReportCommand(raw, ctx, locale);
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
	return isDailyCommand(value);
}

export function localDateString(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

async function buildDayReportCommand(raw: string, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const request = parseDailyCommand(raw);
	const selections = await resolveDailyCommandWindows(request, ctx, locale);
	if (selections.length > 1 && ctx.hasUI) {
		const dates = selections.map((selection) => selection.date).join("、");
		const confirmed = await (ctx.ui as any).confirm("确认补写日报？", `将生成并归档 ${selections.length} 篇日报：${dates}`);
		if (!confirmed) throw new Error("daily report batch cancelled");
	}

	const config = await readDailyConfig();
	const modelSelection = selectDailyModel(ctx.modelRegistry.getAvailable(), ctx.model, config.dailyModel);
	const { sessions } = await scanSessions();
	const results: Array<{ date: string; markdown: string; summary: Awaited<ReturnType<typeof buildDayReport>>["summary"]; errors: string[]; savedPath?: string }> = [];
	for (const selection of selections) {
		const result = await buildDayReport(selection.date, sessions, locale, {
			ctx,
			range: selection.range,
			// 默认日报的截止时刻会随当前时间推进；显式历史日期/范围可复用缓存，避免重复调用模型。
			forceRefresh: !request.expression,
			projectCurrent: request.projectCurrent,
			currentCwd: ctx.cwd,
			ai: { model: modelSelection.model, thinking: modelSelection.thinking, notice: modelSelection.notice, fallbackModel: ctx.model },
		});
		const saved = await saveDailyReport(selection.date, result.markdown, config.outputDir);
		results.push({ date: selection.date, markdown: result.markdown, summary: result.summary, errors: result.errors, savedPath: saved.path });
	}

	const first = results[0];
	const notices = [...new Set(results.flatMap((result) => result.errors).filter(Boolean))];
	if (results.length === 1) {
		const result = first;
		const body = `${result.markdown}\n\n---\n已归档：${result.savedPath}${notices.length > 0 ? `\n⚠️ ${notices.join("；")}` : ""}\n`;
		return { title: `${result.date} 会话日报`, body, stats: result.summary.stats, sessions: [], models: result.summary.models };
	}
	const body = [
		`已生成并归档 ${results.length} 篇日报：`,
		...results.map((result) => `- ${result.date}：${result.savedPath}`),
		...(notices.length > 0 ? ["", `⚠️ ${notices.join("；")}`] : []),
	].join("\n");
	return { title: "多天会话日报", body, stats: first.summary.stats, sessions: [], models: first.summary.models };
}
