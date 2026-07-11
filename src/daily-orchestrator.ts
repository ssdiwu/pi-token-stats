// /insights daily 的编排层：把 UI 确认、配置读取、模型选择、扫描、批量生成、归档、错误隔离封装成单一入口。
// 目标：insights.ts 只判断“这是不是日报请求”，具体日报流程交给这里。

import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { saveDailyReport } from "./daily-archive.ts";
import { parseDailyCommand, resolveDailyCommandWindows } from "./daily-command.ts";
import { readDailyConfig, resolveDailyModel, type DailyConfig } from "./daily-config.ts";
import { buildDayReport } from "./day-report.ts";
import { emptyStats } from "./usage-rollup.ts";
import { dailyUiLabelsFor } from "./daily-ui-labels.ts";
import { reportLabelsFor } from "./report-labels.ts";
import { scanSessions } from "./session-scan.ts";
import type { DaySummary, Report, SessionFile, UiLocale } from "./types.ts";

export interface DailyResult {
	date: string;
	markdown: string;
	summary: DaySummary;
	errors: string[];
	savedPath?: string;
}

export interface DailyFailure {
	date: string;
	error: string;
}

export interface DailyOrchestratorDeps {
	confirm(title: string, body: string): Promise<boolean>;
	readConfig(): Promise<DailyConfig>;
	resolveModel<T extends { provider?: string; id?: string }>(ctx: { model?: T; modelRegistry: { getAvailable: () => T[] } }, config: { dailyModel?: string }): import("./daily-config.ts").DailyModelSelection<T>;
	scanSessions(): Promise<{ sessions: SessionFile[] }>;
	buildDayReport(date: string, sessions: SessionFile[], locale: UiLocale, options: Parameters<typeof buildDayReport>[3]): Promise<{ markdown: string; summary: DaySummary; errors: string[] }>;
	saveDailyReport(date: string, markdown: string, outputDir: string): Promise<{ path: string }>;
}

function defaultDeps(): DailyOrchestratorDeps {
	return {
		confirm: async (title: string, body: string) => {
			// 在真实 extension 上下文中，confirm 由 ctx.ui 提供。
			// 这里抛错而非默认 true/false，避免无 UI 时静默通过。
			throw new Error(`confirm not available: ${title}`);
		},
		readConfig: readDailyConfig,
		resolveModel: resolveDailyModel,
		scanSessions,
		buildDayReport,
		saveDailyReport,
	};
}

export async function runDailyReports(
	raw: string,
	ctx: ExtensionCommandContext | ExtensionContext,
	locale: UiLocale,
	deps: Partial<DailyOrchestratorDeps> = {},
): Promise<Report> {
	const request = parseDailyCommand(raw);
	const selections = await resolveDailyCommandWindows(request, ctx, locale);
	const labels = dailyUiLabelsFor(locale).dailyBatch;

	if (selections.length > 1 && ctx.hasUI) {
		const dates = selections.map((selection) => selection.date).join("、");
		const confirmed = await (deps.confirm ?? (ctx.ui as any).confirm.bind(ctx.ui))(labels.confirmTitle, labels.confirmBody(selections.length, dates));
		if (!confirmed) return { title: labels.title, body: labels.cancelled, stats: emptyStats(), sessions: [], models: [] };
	}

	const { readConfig, resolveModel, scanSessions: scan, buildDayReport: build, saveDailyReport: archive } = { ...defaultDeps(), ...deps };
	const config = await readConfig();
	const modelSelection = resolveModel(ctx, config);
	const { sessions } = await scan();

	const results: DailyResult[] = [];
	const failures: DailyFailure[] = [];
	for (const selection of selections) {
		try {
			const result = await build(selection.date, sessions, locale, {
				ctx,
				range: selection.range,
				// 默认日报的截止时刻会随当前时间推进；显式历史日期/范围可复用缓存，避免重复调用模型。
				forceRefresh: !request.expression,
				projectCurrent: request.projectCurrent,
				currentCwd: ctx.cwd,
				ai: { model: modelSelection.model, thinking: modelSelection.thinking, notice: modelSelection.notice, fallbackModel: ctx.model },
			});
			const saved = await archive(selection.date, result.markdown, config.outputDir);
			results.push({ date: selection.date, markdown: result.markdown, summary: result.summary, errors: result.errors, savedPath: saved.path });
		} catch (error) {
			failures.push({ date: selection.date, error: error instanceof Error ? error.message : String(error) });
		}
	}

	return buildDailyResponse(results, failures, locale);
}

export function buildDailyResponse(results: DailyResult[], failures: DailyFailure[], locale: UiLocale): Report {
	const labels = dailyUiLabelsFor(locale).dailyBatch;

	if (results.length === 0) {
		const failureLines = failures.map((failure) => `- ${failure.date}: ${failure.error}`).join("\n");
		return { title: labels.title, body: `${labels.failed}\n${failureLines}`, stats: emptyStats(), sessions: [], models: [] };
	}

	const first = results[0];
	const notices = [...new Set(results.flatMap((result) => result.errors).filter(Boolean))];

	if (results.length === 1) {
		const result = first;
		const archived = labels.archived(result.savedPath || "");
		const body = `${result.markdown}\n\n---\n${archived}${notices.length > 0 ? `\n⚠️ ${notices.join("；")}` : ""}\n`;
		return { title: reportLabelsFor(locale).reportTitle(result.date), body, stats: result.summary.stats, sessions: [], models: result.summary.models };
	}

	const body = [
		labels.generated(results.length),
		...results.map((result) => `- ${result.date}: ${result.savedPath}`),
		...(failures.length > 0 ? ["", labels.failed, ...failures.map((failure) => `- ${failure.date}: ${failure.error}`)] : []),
		...(notices.length > 0 ? ["", `⚠️ ${notices.join("；")}`] : []),
	].join("\n");
	return { title: labels.title, body, stats: first.summary.stats, sessions: [], models: first.summary.models };
}
