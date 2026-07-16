// 命令主逻辑（组装扫描 → 聚合 → 渲染）。
// buildRangeReport 异步扫描所有会话再聚合；buildSessionReport 只看当前会话分支。
// LLM 时间解析优先，失败回退本地规则。

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { t } from "./locale.ts";
import { rollupEntries, rollupSessions } from "./usage-rollup.ts";
import { isSessionRange, parseRange, parseRangeRequest, resolveRangeWithLlm } from "./time-range.ts";
import { rollupDimensions } from "./dimensions.ts";
import { filterAuditUsage, rollupAuditUsage, scanAuditUsage } from "./audit-usage.ts";
import { buildReport, formatDialogBody } from "./format.ts";
import { isDailyCommand } from "./daily-command.ts";
import { scanSessions } from "./session-scan.ts";
import { runDailyReports } from "./daily-orchestrator.ts";
import type { AuditUsageSummary, Report, RangeRequest, TimeRange, UiLocale } from "./types.ts";

function buildRangeReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], range: TimeRange, locale: UiLocale, auditUsage?: AuditUsageSummary): Report {
	const { stats, models, sessions: sessionRollups } = rollupSessions(sessions, range);
	const dimensions = rollupDimensions(sessions, range);
	return buildReport(t(locale, "title", { range: range.label }), range, stats, sessionRollups, models, locale, dimensions, auditUsage);
}

export async function buildRangeReport(range: TimeRange, locale: UiLocale): Promise<Report> {
	const [{ sessions }, auditRecords] = await Promise.all([scanSessions(), scanAuditUsage()]);
	const auditUsage = rollupAuditUsage(filterAuditUsage(auditRecords, range));
	return buildRangeReportFromSessions(sessions, range, locale, auditUsage);
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
	if (isDayReportRequest(raw)) return runDailyReports(raw, ctx, locale);
	if (isSessionRange(raw)) return buildSessionReport(ctx, locale);

	const llmRange = await resolveRangeWithLlm(raw, ctx);
	if (llmRange === "session") return buildSessionReport(ctx, locale);
	if (llmRange) return buildRangeReport(llmRange, locale);
	const fallback = parseRange(raw, locale);
	return fallback === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(fallback, locale);
}

export function buildTodayReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], locale: UiLocale, now = new Date(), auditUsage?: AuditUsageSummary): Report {
	const range = parseRange(undefined, locale, now) as TimeRange;
	return buildRangeReportFromSessions(sessions, range, locale, auditUsage);
}

export function isDayReportRequest(value: string | undefined): boolean {
	return isDailyCommand(value);
}
