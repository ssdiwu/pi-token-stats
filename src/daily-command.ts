import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { expandDailyDateRange, resolveDefaultDailyWindow, resolveExplicitDayStartWindow, type DailyWindowSelection } from "./daily-options.ts";
import { createDailyTimeRange, getLocalDateString } from "./date-utils.ts";
import { parseRange, resolveRangeWithLlm } from "./time-range.ts";
import type { TimeRange, UiLocale } from "./types.ts";

export interface DailyCommandRequest {
	dayStart?: string;
	projectCurrent: boolean;
	expression: string;
}

export interface DailyToolParams {
	date?: string;
	range?: string;
	projectCurrent?: boolean;
	dayStart?: string;
}

/**
 * 把 daily tool 的结构化参数合并成 DailyCommandRequest。
 * date 优先于 range；projectCurrent/dayStart 直接映射。
 * 校验（dayStart 与日期互斥等）由 resolveDailyCommandWindows 负责。
 */
export function buildDailyRequest(params: DailyToolParams): DailyCommandRequest {
	return {
		dayStart: params.dayStart?.trim() || undefined,
		projectCurrent: Boolean(params.projectCurrent),
		expression: params.date?.trim() || params.range?.trim() || "",
	};
}

export function parseDailyCommand(value: string): DailyCommandRequest {
	const trimmed = value.trim();
	const tokens = trimmed ? trimmed.split(/\s+/) : [];
	const expression: string[] = [];
	let dayStart: string | undefined;
	let projectCurrent = false;
	for (let index = 0; index < tokens.length; index += 1) {
		if (tokens[index] === "--day-start") {
			if (!tokens[index + 1] || tokens[index + 1].startsWith("--")) throw new Error("--day-start requires HH:mm");
			dayStart = tokens[index + 1];
			index += 1;
			continue;
		}
		if (tokens[index] === "--project") {
			if (!tokens[index + 1] || tokens[index + 1].startsWith("--")) throw new Error("--project requires a value");
			if (tokens[index + 1] !== "current") throw new Error("--project only supports current");
			projectCurrent = true;
			index += 1;
			continue;
		}
		if (tokens[index].startsWith("-")) throw new Error(`unsupported daily option: ${tokens[index]}`);
		expression.push(tokens[index]);
	}
	return { dayStart, projectCurrent, expression: expression.join(" ").trim() };
}

function parseDate(value: string): Date | null {
	const match = value.match(/^(\d{4})[/-](\d{2})[/-](\d{2})$/);
	if (!match) return null;
	const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]), 0, 0, 0, 0);
	return date.getFullYear() === Number(match[1]) && date.getMonth() === Number(match[2]) - 1 && date.getDate() === Number(match[3]) ? date : null;
}

function parseCompactDateRange(value: string, year: number): [string, string] | undefined {
	const match = value.match(/(?:^|\D)(\d{2})(\d{2})\s*(?:和|与|到|至|~|～|—|–)\s*(\d{2})(\d{2})(?:\D|$)/);
	if (!match) return undefined;
	const start = `${year}-${match[1]}-${match[2]}`;
	let end = `${year}-${match[3]}-${match[4]}`;
	const startDate = parseDate(start);
	let endDate = parseDate(end);
	if (!startDate || !endDate) throw new Error(`invalid report date: ${value}`);
	if (endDate < startDate) {
		end = `${year + 1}-${match[3]}-${match[4]}`;
		endDate = parseDate(end);
		if (!endDate) throw new Error(`invalid report date: ${value}`);
	}
	return [start, end];
}

function selectionForDate(date: string): DailyWindowSelection {
	return { date, range: createDailyTimeRange(date) };
}

function localDateRange(range: TimeRange): DailyWindowSelection[] {
	const start = getLocalDateString(new Date(range.since));
	const end = getLocalDateString(new Date(Math.max(range.since, range.until - 1)));
	return expandDailyDateRange(start, end).map((date) => {
		const full = createDailyTimeRange(date);
		return {
			date,
			range: {
				label: full.label,
				since: Math.max(full.since, range.since),
				until: Math.min(full.until, range.until),
			},
		};
	});
}

export async function resolveDailyCommandWindows(request: DailyCommandRequest, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale, now = new Date()): Promise<DailyWindowSelection[]> {
	if (request.dayStart) {
		if (request.expression) throw new Error("--day-start cannot be combined with an explicit date or range");
		return [resolveExplicitDayStartWindow(now, request.dayStart)];
	}
	if (!request.expression) return [resolveDefaultDailyWindow(now)];

	const compactDates = parseCompactDateRange(request.expression, now.getFullYear());
	if (compactDates) return expandDailyDateRange(compactDates[0], compactDates[1]).map(selectionForDate);

	const dates = request.expression.match(/^(\d{4}[/-]\d{2}[/-]\d{2})(?:\s*(?:到|至|~|～|—|–)\s*(\d{4}[/-]\d{2}[/-]\d{2}))?$/);
	if (!dates && /\d{4}(?:[/-]\d{1,2})?(?:[/-]\d{1,2})?/.test(request.expression)) throw new Error(`invalid report date: ${request.expression}`);
	if (dates) {
		if (!parseDate(dates[1]) || (dates[2] && !parseDate(dates[2]))) throw new Error(`invalid report date: ${request.expression}`);
		const start = dates[1].replaceAll("/", "-");
		const end = (dates[2] || dates[1]).replaceAll("/", "-");
		return expandDailyDateRange(start, end).map(selectionForDate);
	}

	const resolved = await resolveRangeWithLlm(request.expression, ctx) || parseRange(request.expression, locale, now);
	if (resolved === "session") throw new Error("daily report does not support current-session range");
	return localDateRange(resolved);
}
