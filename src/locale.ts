// 多语言文案层 + locale 解析（迁移自 token-stats）。
// UI 文案优先跟随 pi-di18n 的当前 locale；内置 zh-CN / zh-TW / en，其他回退英文。

import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import type { I18nApiLike, UiLocale } from "./types.ts";

export const MESSAGES = {
	en: {
		rangeToday: "Today",
		rangeLastHour: "Last 1 Hour",
		rangeThisWeek: "This Week",
		rangeLast7Days: "Last 7 Days",
		rangeYesterday: "Yesterday",
		rangeFallback: "Today ({input})",
		last: "Last {count} {unit}",
		unitHours: "Hours",
		unitDays: "Days",
		unitWeeks: "Weeks",
		title: "Insights · {range}",
		range: "Range: {since} → {until}",
		sessions: "Sessions: {count}",
		messages: "Messages: {total} ({users} user / {assistants} assistant / {tools} tool calls)",
		tokens: "Tokens: {total} total",
		tokenBreakdown: "Input {input} · Output {output} · Cache {cache}",
		cost: "Cost: {cost}",
		models: "Models (provider/model):",
		moreModels: "... {count} more model(s)",
		topSessions: "Top Sessions:",
		inputRange: "Enter time range",
		inputPlaceholder: "e.g. 最近5小时 / 1天 / 本周 / 2026-06-17",
		choiceInput: "Enter time range",
		choiceExit: "Exit",
		currentSession: "Current Session",
		projects: "Projects (top {count}):",
		toolsProfile: "Tool profile (top {count}):",
		errorsIntel: "Errors: {rate}% ({errors}/{total}), top: {top}",
		healthFacts: "Context: {count} compaction(s), peak {max} tokens before compact",
		dailyPreviewHint: "… Run /insights daily for the full report",
		dailyPreviewUnavailable: "No cached daily report. Run /insights daily to generate it.",
		panelLoading: "Loading session insights…",
		panelLoadFailed: "Unable to load session insights: {message}",
	},
	"zh-CN": {
		rangeToday: "今天",
		rangeLastHour: "最近 1 小时",
		rangeThisWeek: "本周",
		rangeLast7Days: "最近 7 天",
		rangeYesterday: "昨天",
		rangeFallback: "今天（{input}）",
		last: "最近 {count} {unit}",
		unitHours: "小时",
		unitDays: "天",
		unitWeeks: "周",
		title: "会话洞察 · {range}",
		range: "范围：{since} → {until}",
		sessions: "会话数：{count}",
		messages: "消息：共 {total}（用户 {users} / 助手 {assistants} / 工具调用 {tools}）",
		tokens: "Token：共 {total}",
		tokenBreakdown: "输入 {input} · 输出 {output} · 缓存读取 {cache}",
		cost: "费用：{cost}",
		models: "模型（供应商/模型）：",
		moreModels: "... 还有 {count} 个模型",
		topSessions: "高消耗会话：",
		inputRange: "请输入洞察范围",
		inputPlaceholder: "例如：最近5小时 / 1天 / 本周 / 2026-06-17",
		choiceInput: "输入时间范围",
		choiceExit: "退出",
		currentSession: "当前会话",
		projects: "项目（前 {count}）：",
		toolsProfile: "工具画像（前 {count}）：",
		errorsIntel: "错误：{rate}%（{errors}/{total}），最多：{top}",
		healthFacts: "上下文：压缩 {count} 次，峰值 {max} token",
		dailyPreviewHint: "… 完整日报请运行 /insights daily",
		dailyPreviewUnavailable: "暂无缓存日报。请运行 /insights daily 生成完整日报。",
		panelLoading: "正在加载会话洞察…",
		panelLoadFailed: "加载会话洞察失败：{message}",
	},
	"zh-TW": {
		rangeToday: "今天",
		rangeLastHour: "最近 1 小時",
		rangeThisWeek: "本週",
		rangeLast7Days: "最近 7 天",
		rangeYesterday: "昨天",
		rangeFallback: "今天（{input}）",
		last: "最近 {count} {unit}",
		unitHours: "小時",
		unitDays: "天",
		unitWeeks: "週",
		title: "會話洞察 · {range}",
		range: "範圍：{since} → {until}",
		sessions: "會話數：{count}",
		messages: "訊息：共 {total}（使用者 {users} / 助手 {assistants} / 工具呼叫 {tools}）",
		tokens: "Token：共 {total}",
		tokenBreakdown: "輸入 {input} · 輸出 {output} · 快取讀取 {cache}",
		cost: "費用：{cost}",
		models: "模型（供應商/模型）：",
		moreModels: "... 還有 {count} 個模型",
		topSessions: "高消耗會話：",
		inputRange: "請輸入洞察範圍",
		inputPlaceholder: "例如：最近5小時 / 1天 / 本週 / 2026-06-17",
		choiceInput: "輸入時間範圍",
		choiceExit: "退出",
		currentSession: "目前會話",
		projects: "專案（前 {count}）：",
		toolsProfile: "工具畫像（前 {count}）：",
		errorsIntel: "錯誤：{rate}%（{errors}/{total}），最多：{top}",
		healthFacts: "上下文：壓縮 {count} 次，峰值 {max} token",
		dailyPreviewHint: "… 完整日報請執行 /insights daily",
		dailyPreviewUnavailable: "暫無快取日報。請執行 /insights daily 產生完整日報。",
		panelLoading: "正在載入會話洞察…",
		panelLoadFailed: "載入會話洞察失敗：{message}",
	},
} as const;

export type MessageKey = keyof typeof MESSAGES.en;

export function t(locale: UiLocale, key: MessageKey, params?: Record<string, string | number>): string {
	const template = MESSAGES[locale][key] ?? MESSAGES.en[key];
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`));
}

export function normalizeUiLocale(locale: string | undefined): UiLocale {
	const raw = String(locale || "en").trim().replace(/_/g, "-").toLowerCase();
	if (raw === "zh-tw" || raw.includes("hant") || raw.startsWith("zh-tw")) return "zh-TW";
	if (raw.startsWith("zh")) return "zh-CN";
	return "en";
}

function readJson(path: string): any {
	try {
		if (!existsSync(path)) return null;
		return JSON.parse(readFileSync(path, "utf8"));
	} catch {
		return null;
	}
}

function detectLocaleFromEnv(): string | undefined {
	const candidates = [process.env.PI_LOCALE, process.env.LC_ALL, process.env.LANG].filter(Boolean) as string[];
	for (const candidate of candidates) {
		const base = candidate.trim().split(".")[0]?.replace(/_/g, "-");
		if (base) return base;
	}
	return undefined;
}

function localeFromConfig(cwd: string): string | undefined {
	const projectConfig = readJson(join(cwd, ".pi", "state", "pi-di18n", "config.json"));
	if (typeof projectConfig?.locale === "string") return projectConfig.locale;
	const userConfig = readJson(join(homedir(), ".pi", "agent", "state", "pi-di18n", "config.json"));
	if (typeof userConfig?.locale === "string") return userConfig.locale;
	return undefined;
}

function localeFromI18nApi(pi: ExtensionAPI): string | undefined {
	let locale: string | undefined;
	const payload = {
		reply(api: I18nApiLike) {
			try {
				locale = api?.getLocale?.();
			} catch {
				// ignore
			}
		},
	};
	try {
		pi.events.emit("pi-i18n/requestApi", payload);
		if (!locale) pi.events.emit("pi-core/i18n/requestApi", payload);
	} catch {
		// ignore
	}
	return locale;
}

export function resolveUiLocale(pi: ExtensionAPI, ctx: ExtensionCommandContext | ExtensionContext): UiLocale {
	return normalizeUiLocale(localeFromI18nApi(pi) ?? localeFromConfig(ctx.cwd) ?? detectLocaleFromEnv());
}
