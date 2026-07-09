// 日报生成链：复用 pi-daily 的 extract → report-model → ai-summary / markdown-render，
// 再叠加 pi-session-insights 自己的按天差异（diff）。
// 目标：日报正文直接换成成熟的 pi-daily 风格；洞察、缓存、Obsidian、面板仍留在本项目。

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { ensureDaySummary, ensureDaySummaries, writeDaySummary } from "./day-cache.ts";
import { summarizeReportWithAI } from "./report-ai-summary.ts";
import { renderMarkdownReport } from "./report-markdown.ts";
import { buildReportModel } from "./report-model.ts";
import type { DailyReportModel, DaySummary, SessionFile, UiLocale } from "./types.ts";
import { computeDayDiff, renderDayDiff, type DayDiff } from "./day-diff.ts";

export interface BuildDayReportOptions {
	historyDays?: number;
	ctx?: ExtensionCommandContext | ExtensionContext;
	homeDir?: string;
}

export interface DayReportResult {
	markdown: string;
	summary: DaySummary;
	diff: DayDiff | null;
	report: DailyReportModel;
	source: "ai" | "fallback";
	errors: string[];
}

function localDateOffset(date: string, offsetDays: number): string {
	const [y, m, d] = date.split("-").map(Number);
	const dt = new Date(y, m - 1, d);
	dt.setDate(dt.getDate() + offsetDays);
	const yy = dt.getFullYear();
	const mm = String(dt.getMonth() + 1).padStart(2, "0");
	const dd = String(dt.getDate()).padStart(2, "0");
	return `${yy}-${mm}-${dd}`;
}

function appendDiff(markdown: string, diff: DayDiff | null, locale: UiLocale): string {
	if (!diff) return markdown.trimEnd() + "\n";
	return `${markdown.trimEnd()}\n\n${renderDayDiff(diff, locale).join("\n").trim()}\n`;
}

async function buildDailyMarkdown(report: DailyReportModel, locale: UiLocale, ctx?: ExtensionCommandContext | ExtensionContext): Promise<{ markdown: string; source: "ai" | "fallback"; errors: string[] }> {
	const fallbackMarkdown = renderMarkdownReport(report, locale);
	if (!ctx) {
		return { markdown: fallbackMarkdown, source: "fallback", errors: [] };
	}
	const aiResult = await summarizeReportWithAI(report, ctx, locale);
	if (aiResult.markdown) {
		return { markdown: aiResult.markdown, source: aiResult.source, errors: aiResult.errors };
	}
	const diagnostic = aiResult.errors.length > 0 ? `\n\n---\n\n> pi-session-insights AI summary fallback: ${aiResult.errors.join("; ")}` : "";
	return { markdown: `${fallbackMarkdown.trim()}${diagnostic}\n`, source: "fallback", errors: aiResult.errors };
}

export async function buildDayReport(date: string, sessions: SessionFile[], locale: UiLocale, options: BuildDayReportOptions = {}): Promise<DayReportResult> {
	const homeDir = options.homeDir;
	const summary = await ensureDaySummary(date, sessions, homeDir);

	// 取近 N 天历史（不含当天）做差异
	const historyDays = options.historyDays ?? 7;
	const historyDates: string[] = [];
	for (let i = 1; i <= historyDays; i++) {
		historyDates.push(localDateOffset(date, -i));
	}
	const history = await ensureDaySummaries(historyDates, sessions, homeDir);
	const nonEmptyHistory = history.filter((h) => h.sessionCount > 0);
	const diff = nonEmptyHistory.length > 0 ? computeDayDiff(summary, nonEmptyHistory) : null;

	// 历史日报缓存命中：locale 相同且已有 markdown 时直接返回（昨天页秒开）
	const isToday = date === new Date().toISOString().slice(0, 10);
	if (!isToday && summary.reportMarkdown && summary.reportLocale === locale && summary.reportSource && summary.reportSource !== "none") {
		const cachedReport: DailyReportModel = {
			date,
			range: { label: date, since: summary.since, until: summary.until },
			generatedAt: summary.generatedAt,
			stats: {
				sessionCount: summary.sessionCount,
				projectCount: summary.dimensions.projects.length,
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
		return { markdown: appendDiff(summary.reportMarkdown, diff, locale), summary, diff, report: cachedReport, source: summary.reportSource, errors: [] };
	}

	const report = buildReportModel({ date, sessions, now: new Date() });
	const daily = await buildDailyMarkdown(report, locale, options.ctx);
	const markdown = appendDiff(daily.markdown, diff, locale);

	// 回写日报 markdown 到天缓存。历史天后续可直接命中；今天保留最后一次生成结果。
	const updatedSummary: DaySummary = {
		...summary,
		reportMarkdown: daily.markdown,
		reportSource: daily.source,
		reportLocale: locale,
		generatedAt: new Date().toISOString(),
	};
	await writeDaySummary(updatedSummary, homeDir);

	return { markdown, summary: updatedSummary, diff, report, source: daily.source, errors: daily.errors };
}
