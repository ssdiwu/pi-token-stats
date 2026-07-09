// 时间范围解析层（迁移自 token-stats）。
// 两路解析：LLM 语义解析优先（resolveRangeWithLlm），失败回退本地规则（parseRange）。
// 日报窗口语义（工作日边界/跨午夜）留后续 phase 引入 daily natural-time。

import { complete } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { t } from "./locale.ts";
import type { LlmRangeResolution, RangeBoundary, RangeRequest, TimeRange, UiLocale } from "./types.ts";

export function parseLocalDate(value: string): Date {
	const [year, month, day] = value.split(/[\/-]/).map(Number);
	return new Date(year, month - 1, day);
}

export function isSessionRange(value: string | undefined): boolean {
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

function isDateInput(value: string): boolean {
	return /^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(value.trim());
}

export function parseRange(input: string | undefined, locale: UiLocale, now = new Date()): TimeRange | "session" {
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
		return { label: t(locale, "rangeYesterday"), since: start.getTime(), until: todayStart.getTime() };
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
		return { label: absolute[2] ? `${normalizeDateLabel(absolute[1])} ~ ${normalizeDateLabel(absolute[2])}` : normalizeDateLabel(absolute[1]), since: start.getTime(), until: end.getTime() };
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
	const yesterdayEnd = new Date(todayStart);

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
		return { label: normalizeDateLabel(raw), timestamp: end.getTime() };
	}

	return undefined;
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

export function parseRangeRequest(request: RangeRequest | undefined, locale: UiLocale): TimeRange | "session" {
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
		"You normalize time ranges for a session-insights CLI command.",
		`Current local datetime: ${nowText}`,
		"Return JSON only, no markdown.",
		"Allowed outputs:",
		'{"kind":"range","since":"YYYY-MM-DD HH:MM:SS","until":"YYYY-MM-DD HH:MM:SS","label":"用户可读标签"}',
		'{"kind":"session"}',
		'{"kind":"unparsed"}',
		"Rules:",
		"- Interpret relative dates in local time.",
		"- If the user ends a range with 今天 / today / 现在 / now / 当前, use the current moment, not end-of-day.",
		"- If the user gives a plain date as the end of a date range, use 00:00:00 of the following date as the exclusive end.",
		"- Keep label concise and faithful to the user's intent.",
		"- If the user asks for the current session, return kind=session.",
		`User input: ${input}`,
	].join("\n");
}

export async function resolveRangeWithLlm(input: string, ctx: ExtensionCommandContext | ExtensionContext): Promise<TimeRange | "session" | undefined> {
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
