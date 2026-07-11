// 日报生成链：复用 pi-daily 的 extract → report-model → ai-summary / markdown-render。
// 洞察、缓存、面板仍留在本项目。

import path from "node:path";

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { buildDayDeterministic, buildDeterministicSummary, ensureDaySummary, writeDaySummary } from "./day-cache.ts";
import { summarizeReportWithAI, type AISummaryOptions } from "./report-ai-summary.ts";
import { renderMarkdownReport } from "./report-markdown.ts";
import { buildReportModel } from "./report-model.ts";
import { getLocalDateString } from "./date-utils.ts";
import type { DailyReportModel, DaySummary, SessionFile, TimeRange, UiLocale } from "./types.ts";

export interface BuildDayReportOptions {
	ctx?: ExtensionCommandContext | ExtensionContext;
	homeDir?: string;
	range?: TimeRange;
	forceRefresh?: boolean;
	ai?: AISummaryOptions;
	projectCurrent?: boolean;
	currentCwd?: string;
}

export interface DayReportResult {
	markdown: string;
	summary: DaySummary;
	report: DailyReportModel;
	source: "ai" | "fallback";
	errors: string[];
}

async function buildDailyMarkdown(report: DailyReportModel, locale: UiLocale, ctx?: ExtensionCommandContext | ExtensionContext, ai?: AISummaryOptions): Promise<{ markdown: string; source: "ai" | "fallback"; errors: string[] }> {
	const fallbackMarkdown = renderMarkdownReport(report, locale);
	if (!ctx) {
		return { markdown: fallbackMarkdown, source: "fallback", errors: [] };
	}
	const aiResult = await summarizeReportWithAI(report, ctx, locale, ai);
	if (aiResult.markdown) {
		const modelRecord = aiResult.model ? `\n\n---\n\n> ${aiResult.model}${aiResult.errors.length > 0 ? `; ${aiResult.errors.join("; ")}` : ""}\n` : "";
		return { markdown: `${aiResult.markdown.trimEnd()}${modelRecord}`, source: aiResult.source, errors: aiResult.errors };
	}
	const diagnostic = aiResult.errors.length > 0 ? `\n\n---\n\n> pi-session-insights AI summary fallback: ${aiResult.errors.join("; ")}` : "";
	return { markdown: `${fallbackMarkdown.trim()}${diagnostic}\n`, source: "fallback", errors: aiResult.errors };
}

export async function buildDayReport(date: string, sessions: SessionFile[], locale: UiLocale, options: BuildDayReportOptions = {}): Promise<DayReportResult> {
	const homeDir = options.homeDir;
	const scopedSessions = options.projectCurrent && options.currentCwd
		? sessions.filter((session) => Boolean(session.header?.cwd) && path.resolve(session.header!.cwd!) === path.resolve(options.currentCwd!))
		: sessions;
	const cacheSummary = !options.projectCurrent ? await ensureDaySummary(date, sessions, homeDir) : null;
	const summary = options.range
		? buildDeterministicSummary(date, options.range, scopedSessions)
		: cacheSummary ?? buildDayDeterministic(date, scopedSessions);

	// 历史日报缓存命中：范围与缓存元数据一致、locale 相同且已有 markdown 时直接返回（昨天页秒开）。
	const isToday = date === getLocalDateString();
	const cachedSummary = options.range && cacheSummary?.since === options.range.since && cacheSummary.until === options.range.until ? cacheSummary : summary;
	if (!options.forceRefresh && !isToday && cachedSummary.reportMarkdown && cachedSummary.reportLocale === locale && cachedSummary.reportSource && cachedSummary.reportSource !== "none") {
		const cachedReport: DailyReportModel = {
			date,
			range: { label: date, since: cachedSummary.since, until: cachedSummary.until },
			generatedAt: cachedSummary.generatedAt,
			stats: {
				sessionCount: cachedSummary.sessionCount,
				projectCount: cachedSummary.dimensions.projects.length,
				entryCount: 0,
				fileCount: 0,
				scanErrorCount: 0,
			},
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
		return { markdown: `${cachedSummary.reportMarkdown.trimEnd()}\n`, summary: cachedSummary, report: cachedReport, source: cachedSummary.reportSource, errors: [] };
	}

	const report = buildReportModel({ date, range: options.range, sessions: scopedSessions, projectCurrent: options.projectCurrent, currentCwd: options.currentCwd, now: new Date() });
	const daily = await buildDailyMarkdown(report, locale, options.ctx, options.ai);
	const markdown = `${daily.markdown.trimEnd()}\n`;

	// 回写日报 markdown 到天缓存。历史天后续可直接命中；今天保留最后一次生成结果。
	const updatedSummary: DaySummary = {
		...summary,
		reportMarkdown: daily.markdown,
		reportSource: daily.source,
		reportLocale: locale,
		generatedAt: new Date().toISOString(),
	};
	if (!options.projectCurrent) {
		const cacheUpdate = options.range
			? updatedSummary
			: cacheSummary ? { ...cacheSummary, reportMarkdown: daily.markdown, reportSource: daily.source, reportLocale: locale, generatedAt: updatedSummary.generatedAt } : updatedSummary;
		await writeDaySummary(cacheUpdate, homeDir);
	}

	return { markdown, summary: updatedSummary, report, source: daily.source, errors: daily.errors };
}
