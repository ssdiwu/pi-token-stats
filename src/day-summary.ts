// 按天叙事摘要生成（task 15）。
// 规则回退为纯函数可测（不依赖 LLM）；LLM 调用复用 time-range 的 complete + modelRegistry 模式，真 LLM 手测。
// narrative 是给跨天聚合/diff/日报用的中间产物，非最终展示文本。

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { formatCost, formatNumber } from "./format.ts";
import { writeDaySummary } from "./day-cache.ts";
import type { DaySummary, UiLocale } from "./types.ts";

export interface NarrativeResult {
	narrative: string;
	source: "ai" | "fallback";
}

// 规则回退：纯算法从 DaySummary 结构化字段拼叙事，可测，不调 LLM。
export function generateDayNarrativeFallback(summary: DaySummary, locale: UiLocale): string {
	const lines: string[] = [];
	lines.push(`${summary.date} · ${formatNumber(summary.sessionCount, locale)} 会话 · ${formatNumber(summary.stats.totalTokens, locale)} token · $${formatCost(summary.stats.totalCost)}`);

	const projects = summary.dimensions.projects.slice(0, 3).map((p) => p.name).join("、");
	if (projects) lines.push(`项目：${projects}`);

	const tools = summary.dimensions.tools.slice(0, 3).map((t) => `${t.name} ${t.calls}${t.errors > 0 ? `(err ${t.errors})` : ""}`).join("、");
	if (tools) lines.push(`工具：${tools}`);

	if (summary.dimensions.errors.totalToolResults > 0) {
		lines.push(`错误率：${(summary.dimensions.errors.errorRate * 100).toFixed(1)}%（${summary.dimensions.errors.errors}/${summary.dimensions.errors.totalToolResults}）`);
	}

	if (summary.dimensions.health.compactionCount > 0) {
		lines.push(`压缩 ${summary.dimensions.health.compactionCount} 次，峰值 ${formatNumber(summary.dimensions.health.maxTokensBefore, locale)} token`);
	}

	return lines.join("\n");
}

function buildDayNarrativePrompt(summary: DaySummary, locale: UiLocale): string {
	const facts = {
		date: summary.date,
		sessionCount: summary.sessionCount,
		tokens: summary.stats.totalTokens,
		cost: summary.stats.totalCost,
		topProjects: summary.dimensions.projects.slice(0, 5).map((p) => ({ name: p.name, sessions: p.sessionCount, tokens: p.stats.totalTokens })),
		topTools: summary.dimensions.tools.slice(0, 5).map((t) => ({ name: t.name, calls: t.calls, errors: t.errors })),
		errors: { rate: summary.dimensions.errors.errorRate, errors: summary.dimensions.errors.errors, total: summary.dimensions.errors.totalToolResults },
		health: { compactions: summary.dimensions.health.compactionCount, peakTokensBefore: summary.dimensions.health.maxTokensBefore },
	};
	return [
		"You write a concise day-summary narrative for Pi coding sessions.",
		"Return plain text, no markdown headers, at most 6 short lines in the user's locale.",
		"Focus on: what dominated the day (projects/tools), notable signals (errors/compactions), one-line takeaway.",
		"Do not invent facts; only use the provided structured facts.",
		`Locale: ${locale}`,
		`Facts JSON: ${JSON.stringify(facts)}`,
	].join("\n");
}

function extractText(content: unknown): string {
	if (!Array.isArray(content)) return "";
	return content
		.filter((part): part is { type: string; text: string } => part?.type === "text" && typeof part.text === "string")
		.map((part) => part.text)
		.join("\n")
		.trim();
}

// LLM 叙事：成功返回文本，失败返回 null（由调用方走回退）。
async function generateDayNarrativeWithLlm(summary: DaySummary, locale: UiLocale, ctx: ExtensionCommandContext | ExtensionContext): Promise<string | null> {
	const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
	if (!model) return null;
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return null;

	try {
		const response = await complete(
			model,
			{
				messages: [{ role: "user", content: [{ type: "text", text: buildDayNarrativePrompt(summary, locale) }], timestamp: Date.now() }],
			},
			{ apiKey: auth.apiKey, headers: auth.headers },
		);
		const text = extractText(response.content);
		return text || null;
	} catch {
		return null;
	}
}

// 生成叙事：有 ctx 调 LLM，失败或无 ctx 走规则回退。
export async function generateDayNarrative(summary: DaySummary, locale: UiLocale, ctx?: ExtensionCommandContext | ExtensionContext): Promise<NarrativeResult> {
	if (ctx) {
		const llmText = await generateDayNarrativeWithLlm(summary, locale, ctx);
		if (llmText) return { narrative: llmText, source: "ai" };
	}
	return { narrative: generateDayNarrativeFallback(summary, locale), source: "fallback" };
}

// 用叙事填充 DaySummary：缓存命中（已有 narrative）就复用不调 LLM；否则生成并回写缓存。
// 不传 ctx 走回退，便于测试。
export async function enrichDaySummary(summary: DaySummary, locale: UiLocale, ctx?: ExtensionCommandContext | ExtensionContext, homeDir?: string): Promise<DaySummary> {
	// 缓存命中：已有 ai/fallback narrative 就复用，不再调 LLM
	if (summary.narrative && summary.narrativeSource && summary.narrativeSource !== "none") {
		return summary;
	}
	const { narrative, source } = await generateDayNarrative(summary, locale, ctx);
	const enriched: DaySummary = { ...summary, narrative, narrativeSource: source };
	if (homeDir) {
		try {
			await writeDaySummary(enriched, homeDir);
		} catch {
			// 缓存写入失败不影响生成结果
		}
	}
	return enriched;
}
