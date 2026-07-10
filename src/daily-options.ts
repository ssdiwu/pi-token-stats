import type { TimeRange } from "./types.ts";

export interface DailyWindowSelection {
	date: string;
	range: TimeRange;
}

function localDateString(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

function addLocalDays(date: Date, days: number): Date {
	const result = new Date(date);
	result.setDate(result.getDate() + days);
	return result;
}

function dateAtLocalTime(date: Date, hours: number, minutes: number): Date {
	return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hours, minutes, 0, 0);
}

function parseDayStart(value: string): { hours: number; minutes: number } {
	const match = value.match(/^([01]\d|2[0-3]):([0-5]\d)$/);
	if (!match) throw new Error(`invalid day-start: ${value}`);
	return { hours: Number(match[1]), minutes: Number(match[2]) };
}

function makeRange(start: Date, end: Date): TimeRange {
	return {
		label: `${localDateString(start)} ${String(start.getHours()).padStart(2, "0")}:${String(start.getMinutes()).padStart(2, "0")} → ${localDateString(end)} ${String(end.getHours()).padStart(2, "0")}:${String(end.getMinutes()).padStart(2, "0")}`,
		since: start.getTime(),
		until: end.getTime(),
	};
}

export function resolveDefaultDailyWindow(now = new Date()): DailyWindowSelection {
	if (now.getHours() < 5) {
		const previousDay = addLocalDays(now, -1);
		return {
			date: localDateString(previousDay),
			range: makeRange(dateAtLocalTime(previousDay, 5, 0), now),
		};
	}
	return {
		date: localDateString(now),
		range: makeRange(dateAtLocalTime(now, 0, 0), now),
	};
}

export function resolveExplicitDayStartWindow(now: Date, dayStart: string): DailyWindowSelection {
	const { hours, minutes } = parseDayStart(dayStart);
	const todayStart = dateAtLocalTime(now, hours, minutes);
	const reportDay = now.getTime() < todayStart.getTime() ? addLocalDays(now, -1) : now;
	const start = dateAtLocalTime(reportDay, hours, minutes);
	return { date: localDateString(reportDay), range: makeRange(start, now) };
}

const MAX_DAILY_REPORTS = 31;

export function expandDailyDateRange(startDate: string, endDate: string): string[] {
	const parse = (value: string): Date => {
		const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) throw new Error(`invalid report date: ${value}`);
		const year = Number(match[1]);
		const month = Number(match[2]);
		const day = Number(match[3]);
		const date = new Date(year, month - 1, day, 0, 0, 0, 0);
		if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
			throw new Error(`invalid report date: ${value}`);
		}
		return date;
	};
	const start = parse(startDate);
	const end = parse(endDate);
	if (start > end) throw new Error("daily range start must not be after end");

	const dates: string[] = [];
	for (let cursor = start; cursor <= end; cursor = addLocalDays(cursor, 1)) {
		if (dates.length >= MAX_DAILY_REPORTS) throw new Error(`daily report range exceeds ${MAX_DAILY_REPORTS} days`);
		dates.push(localDateString(cursor));
	}
	return dates;
}
