// 命令主逻辑（组装扫描 → 聚合 → 渲染）。
// buildRangeReport 异步扫描所有会话再聚合；当前会话报告合并 active branch 与同 parentSessionId 的 dteam usage。
// LLM 时间解析优先，失败回退本地规则。

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { t } from "./locale.ts";
import { rollupEntries, rollupSessions } from "./usage-rollup.ts";
import { isSessionRange, parseRange, parseRangeRequest, resolveRangeWithLlm } from "./time-range.ts";
import { rollupDimensions } from "./dimensions.ts";
import { filterAuditUsage, rollupAuditUsage, scanAuditUsage } from "./audit-usage.ts";
import { filterDteamUsage, filterDteamUsageByParentSession, rollupDteamUsage, scanDteamUsage } from "./dteam-usage.ts";
import { buildReport, formatDialogBody } from "./format.ts";
import { scanSessions } from "./session-scan.ts";
import type { AuditUsageSummary, DteamUsageSummary, Report, RangeRequest, TimeRange, UiLocale } from "./types.ts";

function buildRangeReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], range: TimeRange, locale: UiLocale, auditUsage?: AuditUsageSummary, dteamUsage?: DteamUsageSummary): Report {
	const { stats, models, sessions: sessionRollups } = rollupSessions(sessions, range);
	const dimensions = rollupDimensions(sessions, range);
	return buildReport(t(locale, "title", { range: range.label }), range, stats, sessionRollups, models, locale, dimensions, auditUsage, dteamUsage);
}

export async function buildRangeReport(range: TimeRange, locale: UiLocale): Promise<Report> {
	const [{ sessions }, auditRecords, dteamRecords] = await Promise.all([
		scanSessions({ entryRange: range }),
		scanAuditUsage(),
		scanDteamUsage(),
	]);
	const auditUsage = rollupAuditUsage(filterAuditUsage(auditRecords, range));
	const dteamUsage = rollupDteamUsage(filterDteamUsage(dteamRecords, range));
	return buildRangeReportFromSessions(sessions, range, locale, auditUsage, dteamUsage);
}

export function buildSessionReport(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale, dteamUsage?: DteamUsageSummary): Report {
	const { stats, models } = rollupEntries(ctx.sessionManager.getBranch());
	const name = ctx.sessionManager.getSessionName?.() ?? ctx.sessionManager.getSessionId?.() ?? t(locale, "currentSession");
	return {
		title: t(locale, "title", { range: name }),
		body: formatDialogBody(undefined, stats, [], models, locale, undefined, undefined, dteamUsage),
		stats,
		sessions: [],
		models,
		dteamUsage,
	};
}

async function buildCurrentSessionReport(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const parentSessionId = ctx.sessionManager.getSessionId?.();
	if (!parentSessionId) return buildSessionReport(ctx, locale);
	const records = await scanDteamUsage();
	return buildSessionReport(ctx, locale, rollupDteamUsage(filterDteamUsageByParentSession(records, parentSessionId)));
}

export async function buildReportForRequest(request: RangeRequest | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const range = parseRangeRequest(request, locale);
	return range === "session" ? buildCurrentSessionReport(ctx, locale) : buildRangeReport(range, locale);
}

export async function buildInteractiveReport(rangeText: string | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const raw = rangeText?.trim();
	if (!raw) return buildRangeReport(parseRange(undefined, locale) as TimeRange, locale);
	if (isSessionRange(raw)) return buildCurrentSessionReport(ctx, locale);

	const llmRange = await resolveRangeWithLlm(raw, ctx);
	if (llmRange === "session") return buildCurrentSessionReport(ctx, locale);
	if (llmRange) return buildRangeReport(llmRange, locale);
	const fallback = parseRange(raw, locale);
	return fallback === "session" ? buildCurrentSessionReport(ctx, locale) : buildRangeReport(fallback, locale);
}

export function buildTodayReportFromSessions(sessions: Awaited<ReturnType<typeof scanSessions>>["sessions"], locale: UiLocale, now = new Date(), auditUsage?: AuditUsageSummary, dteamUsage?: DteamUsageSummary): Report {
	const range = parseRange(undefined, locale, now) as TimeRange;
	return buildRangeReportFromSessions(sessions, range, locale, auditUsage, dteamUsage);
}
