import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import type { ExtensionAPI, ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

interface TokenStats {
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	totalCost: number;
}

interface ModelRollup {
	provider: string;
	model: string;
	stats: TokenStats;
}

interface SessionRollup {
	file: string;
	name: string;
	stats: TokenStats;
	models: ModelRollup[];
}

interface Report {
	title: string;
	body: string;
	stats: TokenStats;
	sessions: SessionRollup[];
	models: ModelRollup[];
}

interface TimeRange {
	label: string;
	since: number;
	until: number;
}

type UiLocale = "en" | "zh-CN" | "zh-TW";

type I18nApiLike = {
	getLocale?: () => string;
};

const TokenStatsParams = Type.Object({
	range: Type.Optional(Type.String({ description: "Natural-language range, e.g. 今天, 最近5小时, 本周, 最近一周, 2026-06-17" })),
});

const MESSAGES = {
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
		title: "Tokens · {range}",
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
		title: "Token 统计 · {range}",
		range: "范围：{since} → {until}",
		sessions: "会话数：{count}",
		messages: "消息：共 {total}（用户 {users} / 助手 {assistants} / 工具调用 {tools}）",
		tokens: "Token：共 {total}",
		tokenBreakdown: "输入 {input} · 输出 {output} · 缓存读取 {cache}",
		cost: "费用：{cost}",
		models: "模型（供应商/模型）：",
		moreModels: "... 还有 {count} 个模型",
		topSessions: "高消耗会话：",
		inputRange: "请输入 token 统计范围",
		inputPlaceholder: "例如：最近5小时 / 1天 / 本周 / 2026-06-17",
		choiceInput: "输入时间范围",
		choiceExit: "退出",
		currentSession: "当前会话",
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
		title: "Token 統計 · {range}",
		range: "範圍：{since} → {until}",
		sessions: "會話數：{count}",
		messages: "訊息：共 {total}（使用者 {users} / 助手 {assistants} / 工具呼叫 {tools}）",
		tokens: "Token：共 {total}",
		tokenBreakdown: "輸入 {input} · 輸出 {output} · 快取讀取 {cache}",
		cost: "費用：{cost}",
		models: "模型（供應商/模型）：",
		moreModels: "... 還有 {count} 個模型",
		topSessions: "高消耗會話：",
		inputRange: "請輸入 token 統計範圍",
		inputPlaceholder: "例如：最近5小時 / 1天 / 本週 / 2026-06-17",
		choiceInput: "輸入時間範圍",
		choiceExit: "退出",
		currentSession: "目前會話",
	},
} as const;

function t(locale: UiLocale, key: keyof typeof MESSAGES.en, params?: Record<string, string | number>): string {
	const template = MESSAGES[locale][key] ?? MESSAGES.en[key];
	return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (_match, name: string) => String(params?.[name] ?? `{${name}}`));
}

function normalizeUiLocale(locale: string | undefined): UiLocale {
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

function resolveUiLocale(pi: ExtensionAPI, ctx: ExtensionCommandContext | ExtensionContext): UiLocale {
	return normalizeUiLocale(localeFromI18nApi(pi) ?? localeFromConfig(ctx.cwd) ?? detectLocaleFromEnv());
}

function emptyStats(): TokenStats {
	return {
		userMessages: 0,
		assistantMessages: 0,
		toolCalls: 0,
		toolResults: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
		totalCost: 0,
	};
}

function addStats(target: TokenStats, source: TokenStats): void {
	target.userMessages += source.userMessages;
	target.assistantMessages += source.assistantMessages;
	target.toolCalls += source.toolCalls;
	target.toolResults += source.toolResults;
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.totalTokens += source.totalTokens;
	target.totalCost += source.totalCost;
}

function addUsage(stats: TokenStats, usage: any): void {
	if (!usage) return;

	const input = asNumber(usage.input);
	const output = asNumber(usage.output);
	const cacheRead = asNumber(usage.cacheRead);
	const cacheWrite = asNumber(usage.cacheWrite);
	const total = asNumber(usage.totalTokens) || input + output + cacheRead + cacheWrite;
	const cost = asNumber(usage.cost?.total);

	stats.inputTokens += input;
	stats.outputTokens += output;
	stats.cacheReadTokens += cacheRead;
	stats.cacheWriteTokens += cacheWrite;
	stats.totalTokens += total;
	stats.totalCost += cost;
}

function addModelStats(models: Map<string, ModelRollup>, message: any): void {
	const provider = typeof message?.provider === "string" && message.provider ? message.provider : "unknown-provider";
	const model = typeof message?.model === "string" && message.model ? message.model : "unknown-model";
	const key = `${provider}/${model}`;
	let rollup = models.get(key);
	if (!rollup) {
		rollup = { provider, model, stats: emptyStats() };
		models.set(key, rollup);
	}
	rollup.stats.assistantMessages++;
	rollup.stats.toolCalls += countToolCalls(message.content);
	addUsage(rollup.stats, message.usage);
}

function mergeModelRollups(target: Map<string, ModelRollup>, models: ModelRollup[]): void {
	for (const source of models) {
		const key = `${source.provider}/${source.model}`;
		let rollup = target.get(key);
		if (!rollup) {
			rollup = { provider: source.provider, model: source.model, stats: emptyStats() };
			target.set(key, rollup);
		}
		addStats(rollup.stats, source.stats);
	}
}

function sortedModels(models: Map<string, ModelRollup>): ModelRollup[] {
	return [...models.values()].sort((left, right) => right.stats.totalTokens - left.stats.totalTokens);
}

function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countToolCalls(content: unknown): number {
	if (!Array.isArray(content)) return 0;
	return content.filter((block) => block && typeof block === "object" && (block as { type?: string }).type === "toolCall").length;
}

function entryTimestamp(entry: any): number {
	const messageTimestamp = asNumber(entry?.message?.timestamp);
	if (messageTimestamp > 0) return messageTimestamp;

	const timestamp = Date.parse(entry?.timestamp ?? "");
	return Number.isFinite(timestamp) ? timestamp : 0;
}

function addMessageEntry(stats: TokenStats, entry: any, models?: Map<string, ModelRollup>): void {
	if (entry?.type !== "message") return;

	const message = entry.message;
	if (message?.role === "user") {
		stats.userMessages++;
		return;
	}

	if (message?.role === "assistant") {
		stats.assistantMessages++;
		stats.toolCalls += countToolCalls(message.content);
		addUsage(stats, message.usage);
		if (models) addModelStats(models, message);
		return;
	}

	if (message?.role === "toolResult") stats.toolResults++;
}

function rollupEntries(entries: any[], range?: TimeRange): { stats: TokenStats; models: ModelRollup[] } {
	const stats = emptyStats();
	const models = new Map<string, ModelRollup>();
	for (const entry of entries) {
		const timestamp = entryTimestamp(entry);
		if (!range || (timestamp >= range.since && timestamp <= range.until)) addMessageEntry(stats, entry, models);
	}
	return { stats, models: sortedModels(models) };
}

function listSessionFiles(root: string): string[] {
	if (!existsSync(root)) return [];

	const files: string[] = [];
	for (const projectDir of readdirSync(root, { withFileTypes: true })) {
		if (!projectDir.isDirectory()) continue;
		const projectPath = join(root, projectDir.name);
		for (const sessionFile of readdirSync(projectPath, { withFileTypes: true })) {
			if (sessionFile.isFile() && sessionFile.name.endsWith(".jsonl")) files.push(join(projectPath, sessionFile.name));
		}
	}
	return files;
}

function readJsonLines(file: string): any[] {
	try {
		return readFileSync(file, "utf8")
			.split("\n")
			.filter((line) => line.trim().length > 0)
			.map((line) => JSON.parse(line));
	} catch {
		return [];
	}
}

function rollupSessionFile(file: string, range: TimeRange): SessionRollup | undefined {
	const entries = readJsonLines(file);
	if (entries.length === 0) return undefined;

	const nameEntry = entries.filter((entry) => entry?.type === "session_info" && typeof entry.name === "string").pop();
	const { stats, models } = rollupEntries(entries, range);

	if (messageTotal(stats) === 0 && stats.totalTokens === 0) return undefined;

	return {
		file,
		name: nameEntry?.name ?? basename(file).replace(/\.jsonl$/, ""),
		stats,
		models,
	};
}

function messageTotal(stats: TokenStats): number {
	return stats.userMessages + stats.assistantMessages + stats.toolResults;
}

function parseRange(input: string | undefined, locale: UiLocale, now = new Date()): TimeRange | "session" {
	const raw = (input ?? "").trim().toLowerCase();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());

	if (!raw || ["today", "day", "d", "今天", "當天", "当天", "日报", "日報"].includes(raw)) {
		return { label: t(locale, "rangeToday"), since: todayStart.getTime(), until: now.getTime() };
	}
	if (["session", "s", "current", "当前", "當前", "当前会话", "當前會話"].includes(raw)) return "session";
	if (["hour", "h", "1h", "近一小时", "最近一小时", "过去一小时", "近一小時", "最近一小時", "過去一小時"].includes(raw)) {
		return { label: t(locale, "rangeLastHour"), since: now.getTime() - 60 * 60 * 1000, until: now.getTime() };
	}
	if (["week", "w", "本周", "本週", "周报", "週報"].includes(raw)) {
		const start = new Date(todayStart);
		start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
		return { label: t(locale, "rangeThisWeek"), since: start.getTime(), until: now.getTime() };
	}
	if (["最近一周", "过去一周", "近一周", "最近一週", "過去一週", "近一週", "last week", "last 1 week"].includes(raw)) {
		return { label: t(locale, "rangeLast7Days"), since: now.getTime() - 7 * 24 * 60 * 60 * 1000, until: now.getTime() };
	}
	if (["yesterday", "昨天"].includes(raw)) {
		const start = new Date(todayStart);
		start.setDate(start.getDate() - 1);
		return { label: t(locale, "rangeYesterday"), since: start.getTime(), until: todayStart.getTime() - 1 };
	}

	const relative = raw.match(/(?:(?:最近|過去|过去|近|last)\s*)?(\d+)\s*(?:个|個)?\s*(小时|小時|hour|hours|h|天|日|day|days|d|周|週|week|weeks|w)/i);
	if (relative) {
		const count = Number(relative[1]);
		const unit = relative[2];
		const hourMs = 60 * 60 * 1000;
		const dayMs = 24 * hourMs;
		const unitMs = /小时|小時|hour|hours|h/i.test(unit) ? hourMs : /周|週|week|weeks|w/i.test(unit) ? 7 * dayMs : dayMs;
		const labelUnit = unitMs === hourMs ? t(locale, "unitHours") : unitMs === 7 * dayMs ? t(locale, "unitWeeks") : t(locale, "unitDays");
		return { label: t(locale, "last", { count, unit: labelUnit }), since: now.getTime() - count * unitMs, until: now.getTime() };
	}

	const absolute = raw.match(/(\d{4}-\d{1,2}-\d{1,2})(?:\s*(?:到|至|~)\s*(\d{4}-\d{1,2}-\d{1,2}))?/);
	if (absolute) {
		const start = parseLocalDate(absolute[1]);
		const end = absolute[2] ? parseLocalDate(absolute[2]) : new Date(start);
		end.setDate(end.getDate() + 1);
		return { label: absolute[2] ? `${absolute[1]} ~ ${absolute[2]}` : absolute[1], since: start.getTime(), until: end.getTime() - 1 };
	}

	return { label: t(locale, "rangeFallback", { input: input?.trim() || "default" }), since: todayStart.getTime(), until: now.getTime() };
}

function parseLocalDate(value: string): Date {
	const [year, month, day] = value.split("-").map(Number);
	return new Date(year, month - 1, day);
}

function formatNumber(value: number, locale: UiLocale): string {
	return Math.round(value).toLocaleString(locale);
}

function formatCost(value: number): string {
	return value.toFixed(4);
}

function formatTime(value: number, locale: UiLocale): string {
	return new Date(value).toLocaleString(locale);
}

function buildRangeReport(range: TimeRange, locale: UiLocale): Report {
	const sessionsRoot = join(getAgentDir(), "sessions");
	const sessions = listSessionFiles(sessionsRoot)
		.map((file) => rollupSessionFile(file, range))
		.filter((session): session is SessionRollup => Boolean(session));
	const stats = emptyStats();
	const modelMap = new Map<string, ModelRollup>();
	for (const session of sessions) {
		addStats(stats, session.stats);
		mergeModelRollups(modelMap, session.models);
	}
	const models = sortedModels(modelMap);
	return { title: t(locale, "title", { range: range.label }), body: formatDialogBody(range, stats, sessions, models, locale), stats, sessions, models };
}

function buildSessionReport(ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Report {
	const { stats, models } = rollupEntries(ctx.sessionManager.getBranch());
	const name = ctx.sessionManager.getSessionName?.() ?? ctx.sessionManager.getSessionId?.() ?? t(locale, "currentSession");
	return { title: t(locale, "title", { range: name }), body: formatDialogBody(undefined, stats, [], models, locale), stats, sessions: [], models };
}

function formatDialogBody(range: TimeRange | undefined, stats: TokenStats, sessions: SessionRollup[], models: ModelRollup[], locale: UiLocale): string {
	const lines = [
		...(range ? [t(locale, "range", { since: formatTime(range.since, locale), until: formatTime(range.until, locale) }), t(locale, "sessions", { count: formatNumber(sessions.length, locale) })] : []),
		t(locale, "messages", {
			total: formatNumber(messageTotal(stats), locale),
			users: formatNumber(stats.userMessages, locale),
			assistants: formatNumber(stats.assistantMessages, locale),
			tools: formatNumber(stats.toolCalls, locale),
		}),
		t(locale, "tokens", { total: formatNumber(stats.totalTokens, locale) }),
		t(locale, "tokenBreakdown", {
			input: formatNumber(stats.inputTokens, locale),
			output: formatNumber(stats.outputTokens, locale),
			cache: formatNumber(stats.cacheReadTokens, locale),
		}),
		t(locale, "cost", { cost: formatCost(stats.totalCost) }),
	];

	const topModels = models.slice(0, 5);
	if (topModels.length > 0) {
		lines.push("", t(locale, "models"));
		for (const [index, item] of topModels.entries()) {
			lines.push(`${index + 1}. ${item.provider}/${item.model}: ${formatNumber(item.stats.totalTokens, locale)} / ${formatCost(item.stats.totalCost)}`);
		}
		if (models.length > topModels.length) lines.push(t(locale, "moreModels", { count: models.length - topModels.length }));
	}

	const topSessions = sessions
		.filter((session) => session.stats.totalTokens > 0 || session.stats.totalCost > 0)
		.sort((left, right) => right.stats.totalTokens - left.stats.totalTokens)
		.slice(0, 3);
	if (topSessions.length > 0) {
		lines.push("", t(locale, "topSessions"));
		for (const [index, session] of topSessions.entries()) {
			lines.push(`${index + 1}. ${session.name}: ${formatNumber(session.stats.totalTokens, locale)} / ${formatCost(session.stats.totalCost)}`);
		}
	}

	return lines.join("\n");
}

async function showDialog(ctx: ExtensionCommandContext | ExtensionContext, title: string, body: string, locale: UiLocale): Promise<void> {
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
		const report = buildReportForRange(range, ctx, locale);
		currentTitle = report.title;
		currentBody = report.body;
	}
}

function buildReportForRange(rangeText: string | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale) {
	const range = parseRange(rangeText, locale);
	return range === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(range, locale);
}

export default function tokenStatsExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "token_stats",
		label: "Token Stats",
		description: "Read Pi session token usage for natural-language time ranges such as today, 最近5小时, 本周, 最近一周, or a date.",
		promptSnippet: "Read Pi token usage when the user asks about token/cost consumption for a time range.",
		promptGuidelines: [
			"Use token_stats when the user asks about Pi token usage, cost, or session consumption in natural language.",
			"Pass the user's original time expression to token_stats.range, for example 最近5小时, 今天, 本周, 最近一周, or 2026-06-17.",
			"If the user does not specify a time range, use token_stats with no range; it defaults to today.",
		],
		parameters: TokenStatsParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const locale = resolveUiLocale(pi, ctx);
			const report = buildReportForRange(params.range, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
			return {
				content: [{ type: "text", text: `${report.title}\n\n${report.body}` }],
				details: { stats: report.stats, sessions: report.sessions.length, models: report.models, locale },
			};
		},
	});

	pi.registerCommand("tokens", {
		description: "Show Pi token usage. Defaults to today; accepts natural-language ranges like 最近5小时, 本周, 最近一周.",
		handler: async (args, ctx) => {
			const locale = resolveUiLocale(pi, ctx);
			const report = buildReportForRange(args, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
		},
	});
}
