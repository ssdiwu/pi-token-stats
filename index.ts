import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import { basename, join } from "node:path";
import { complete } from "@earendil-works/pi-ai";
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

interface RangeRequest {
	range?: string;
	since?: string;
	until?: string;
	label?: string;
}

interface LlmRangeResolution {
	kind: "range" | "session" | "unparsed";
	since?: string;
	until?: string;
	label?: string;
}

type RangeBoundary = {
	label: string;
	timestamp: number;
};

type UiLocale = "en" | "zh-CN" | "zh-TW";

type I18nApiLike = {
	getLocale?: () => string;
};

const TokenStatsParams = Type.Object({
	range: Type.Optional(Type.String({ description: "Natural-language range, e.g. 今天, 最近5小时, 本周, 最近一周, 昨天到今天" })),
	since: Type.Optional(Type.String({ description: "Absolute local start time, e.g. 2026-06-18 00:00:00" })),
	until: Type.Optional(Type.String({ description: "Absolute local end time, e.g. 2026-06-19 03:50:57" })),
	label: Type.Optional(Type.String({ description: "Display label for the selected range, e.g. 昨天到今天" })),
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
	const rawInput = (input ?? "").trim();
	const raw = rawInput.toLowerCase();
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

	const namedRange = parseNamedRange(rawInput, locale, now);
	if (namedRange) return namedRange;

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

	const absolute = rawInput.match(/(\d{4}[\/-]\d{1,2}[\/-]\d{1,2})(?:\s*(?:到|至|~|～|—|–)\s*(\d{4}[\/-]\d{1,2}[\/-]\d{1,2}))?/i);
	if (absolute) {
		const start = parseLocalDate(absolute[1]);
		const end = absolute[2] ? parseLocalDate(absolute[2]) : new Date(start);
		end.setDate(end.getDate() + 1);
		return { label: absolute[2] ? `${normalizeDateLabel(absolute[1])} ~ ${normalizeDateLabel(absolute[2])}` : normalizeDateLabel(absolute[1]), since: start.getTime(), until: end.getTime() - 1 };
	}

	return { label: t(locale, "rangeFallback", { input: rawInput || "default" }), since: todayStart.getTime(), until: now.getTime() };
}

function parseNamedRange(input: string, locale: UiLocale, now: Date): TimeRange | undefined {
	const parts = input.split(/\s*(?:到|至|~|～|—|–)\s*/).map((part) => part.trim()).filter(Boolean);
	if (parts.length !== 2) return undefined;

	const start = parseRangeBoundary(parts[0], "start", locale, now);
	const end = parseRangeBoundary(parts[1], "end", locale, now);
	if (!start || !end || start.timestamp > end.timestamp) return undefined;

	return { label: `${start.label} ~ ${end.label}`, since: start.timestamp, until: end.timestamp };
}

function parseRangeBoundary(input: string, side: "start" | "end", locale: UiLocale, now: Date): RangeBoundary | undefined {
	const raw = input.trim();
	const normalized = raw.toLowerCase();
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
	const yesterdayStart = new Date(todayStart);
	yesterdayStart.setDate(yesterdayStart.getDate() - 1);
	const yesterdayEnd = new Date(todayStart.getTime() - 1);

	if (["today", "今天", "當天", "当天"].includes(normalized)) {
		return { label: t(locale, "rangeToday"), timestamp: side === "start" ? todayStart.getTime() : now.getTime() };
	}
	if (["yesterday", "昨天"].includes(normalized)) {
		return { label: t(locale, "rangeYesterday"), timestamp: side === "start" ? yesterdayStart.getTime() : yesterdayEnd.getTime() };
	}
	if (["now", "现在", "現在", "当前", "當前"].includes(normalized)) {
		return { label: side === "start" ? raw : normalizeBoundaryLabel(raw), timestamp: now.getTime() };
	}
	if (isDateInput(raw)) {
		const date = parseLocalDate(raw);
		if (side === "start") return { label: normalizeDateLabel(raw), timestamp: date.getTime() };
		const end = new Date(date);
		end.setDate(end.getDate() + 1);
		return { label: normalizeDateLabel(raw), timestamp: end.getTime() - 1 };
	}

	return undefined;
}

function isDateInput(value: string): boolean {
	return /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(value.trim());
}

function isSessionRange(value: string | undefined): boolean {
	const raw = value?.trim().toLowerCase();
	if (!raw) return false;
	return ["session", "s", "current", "当前", "當前", "当前会话", "當前會話"].includes(raw);
}

function normalizeBoundaryLabel(value: string): string {
	return value.trim().replace(/\s+/g, " ");
}

function normalizeDateLabel(value: string): string {
	const [year, month, day] = value.trim().split(/[\/-]/).map(Number);
	return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function parseAbsoluteDateTime(value: string, side: "start" | "end"): number | undefined {
	const raw = value.trim();
	const local = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})(?:[ T](\d{1,2})(?::(\d{1,2}))?(?::(\d{1,2}))?)?$/);
	if (local) {
		const year = Number(local[1]);
		const month = Number(local[2]);
		const day = Number(local[3]);
		const hasTime = local[4] !== undefined;
		const hours = hasTime ? Number(local[4]) : side === "start" ? 0 : 23;
		const minutes = hasTime ? Number(local[5] ?? 0) : side === "start" ? 0 : 59;
		const seconds = hasTime ? Number(local[6] ?? 0) : side === "start" ? 0 : 59;
		return new Date(year, month - 1, day, hours, minutes, seconds).getTime();
	}

	const parsed = Date.parse(raw);
	return Number.isFinite(parsed) ? parsed : undefined;
}

function buildStructuredRange(sinceText: string, untilText: string, label?: string): TimeRange | undefined {
	const since = parseAbsoluteDateTime(sinceText, "start");
	const until = parseAbsoluteDateTime(untilText, "end");
	if (since === undefined || until === undefined || since > until) return undefined;
	return {
		label: normalizeBoundaryLabel(label || `${sinceText} ~ ${untilText}`),
		since,
		until,
	};
}

function parseRangeRequest(request: RangeRequest | undefined, locale: UiLocale): TimeRange | "session" {
	if (request?.since?.trim() && request?.until?.trim()) {
		const structured = buildStructuredRange(request.since, request.until, request.label);
		if (structured) return structured;
	}
	if (isSessionRange(request?.range)) return "session";
	return parseRange(request?.range, locale);
}

function extractResponseText(content: Array<{ type?: string; text?: string }>): string {
	return content.filter((part) => part?.type === "text" && typeof part.text === "string").map((part) => part.text).join("\n").trim();
}

function parseLlmRangeResolution(text: string): LlmRangeResolution | undefined {
	const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
	const rawJson = fenced ?? text.match(/\{[\s\S]*\}/)?.[0];
	if (!rawJson) return undefined;
	try {
		const parsed = JSON.parse(rawJson) as LlmRangeResolution;
		if (parsed?.kind === "range" || parsed?.kind === "session" || parsed?.kind === "unparsed") return parsed;
	} catch {
		// ignore
	}
	return undefined;
}

function buildRangeParsePrompt(input: string, now: Date): string {
	const nowText = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")} ${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}:${String(now.getSeconds()).padStart(2, "0")}`;
	return [
		"You normalize token-stat time ranges for a CLI command.",
		`Current local datetime: ${nowText}`,
		"Return JSON only, no markdown.",
		"Allowed outputs:",
		'{"kind":"range","since":"YYYY-MM-DD HH:MM:SS","until":"YYYY-MM-DD HH:MM:SS","label":"用户可读标签"}',
		'{"kind":"session"}',
		'{"kind":"unparsed"}',
		"Rules:",
		"- Interpret relative dates in local time.",
		"- If the user ends a range with 今天 / today / 现在 / now / 当前, use the current moment, not end-of-day.",
		"- If the user gives a plain date as the end of a date range, use 23:59:59 of that date.",
		"- Keep label concise and faithful to the user's intent.",
		"- If the user asks for the current session, return kind=session.",
		`User input: ${input}`,
	].join("\n");
}

async function resolveRangeWithLlm(input: string, ctx: ExtensionCommandContext | ExtensionContext): Promise<TimeRange | "session" | undefined> {
	const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
	if (!model) return undefined;

	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth.ok || !auth.apiKey) return undefined;

	try {
		const response = await complete(
			model,
			{
				messages: [{ role: "user", content: [{ type: "text", text: buildRangeParsePrompt(input, new Date()) }], timestamp: Date.now() }],
			},
			{ apiKey: auth.apiKey, headers: auth.headers },
		);
		const rawResponseText = extractResponseText(response.content);
		const resolved = parseLlmRangeResolution(rawResponseText);
		if (!resolved) return undefined;
		if (resolved.kind === "session") return "session";
		if (resolved.kind !== "range" || !resolved.since || !resolved.until) return undefined;
		return buildStructuredRange(resolved.since, resolved.until, resolved.label || input);
	} catch {
		return undefined;
	}
}

function parseLocalDate(value: string): Date {
	const [year, month, day] = value.split(/[\/-]/).map(Number);
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

async function buildReportForRequest(request: RangeRequest | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const range = parseRangeRequest(request, locale);
	return range === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(range, locale);
}

async function buildInteractiveReport(rangeText: string | undefined, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<Report> {
	const raw = rangeText?.trim();
	if (!raw) return buildRangeReport(parseRange(undefined, locale) as TimeRange, locale);
	if (isSessionRange(raw)) return buildSessionReport(ctx, locale);
	const llmRange = await resolveRangeWithLlm(raw, ctx);
	if (llmRange === "session") return buildSessionReport(ctx, locale);
	if (llmRange) return buildRangeReport(llmRange, locale);
	const fallback = parseRange(raw, locale);
	return fallback === "session" ? buildSessionReport(ctx, locale) : buildRangeReport(fallback, locale);
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
		const report = await buildInteractiveReport(range, ctx, locale);
		currentTitle = report.title;
		currentBody = report.body;
	}
}

export default function tokenStatsExtension(pi: ExtensionAPI) {
	pi.registerTool({
		name: "token_stats",
		label: "Token Stats",
		description: "Read Pi session token usage for a time range. Prefer structured since/until absolute times when the range is already understood.",
		promptSnippet: "Read Pi token usage when the user asks about token/cost consumption for a time range.",
		promptGuidelines: [
			"Use token_stats when the user asks about Pi token usage, cost, or session consumption in natural language.",
			"Prefer passing token_stats.since and token_stats.until as absolute local timestamps plus token_stats.label when you can infer the exact range.",
			"Use token_stats.range for current session requests or when you need the extension's built-in fallback parsing.",
			"If the user does not specify a time range, use token_stats with no range; it defaults to today.",
		],
		parameters: TokenStatsParams,
		async execute(_toolCallId, params, _signal, _onUpdate, ctx) {
			const locale = resolveUiLocale(pi, ctx);
			const report = await buildReportForRequest(params, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
			return {
				content: [{ type: "text", text: `${report.title}\n\n${report.body}` }],
				details: { stats: report.stats, sessions: report.sessions.length, models: report.models, locale },
			};
		},
	});

	pi.registerCommand("tokens", {
		description: "Show Pi token usage. Defaults to today; free-form time input is resolved by the current model first, then by built-in fallback rules.",
		handler: async (args, ctx) => {
			const locale = resolveUiLocale(pi, ctx);
			const report = await buildInteractiveReport(args, ctx, locale);
			await showDialog(ctx, report.title, report.body, locale);
		},
	});
}
