// 日期工具：统一本地日期字符串、自然日 TimeRange 和格式化。
// 所有依赖本地时区的日期操作集中在这里，避免在业务模块里重复实现。

import type { TimeRange } from "./types.ts";

export function formatTimePart(value: number): string {
	return String(value).padStart(2, "0");
}

/** 返回本地日期字符串 YYYY-MM-DD。 */
export function getLocalDateString(now = new Date()): string {
	const year = now.getFullYear();
	const month = formatTimePart(now.getMonth() + 1);
	const day = formatTimePart(now.getDate());
	return `${year}-${month}-${day}`;
}

/** 返回本地日期时间字符串 YYYY-MM-DD HH:mm。 */
export function formatLocalDateTime(date: Date): string {
	return `${getLocalDateString(date)} ${formatTimePart(date.getHours())}:${formatTimePart(date.getMinutes())}`;
}

/** 返回带秒的本地日期时间字符串。 */
export function formatLocalDateTimeSeconds(date: Date): string {
	return `${formatLocalDateTime(date)}:${formatTimePart(date.getSeconds())}`;
}

/** 构造目标自然日的半开时间范围 [00:00, 次日 00:00)，使用本地时区。 */
export function createDailyTimeRange(targetDate: string): TimeRange {
	const [year, month, day] = targetDate.split("-").map(Number);
	const start = new Date(year, month - 1, day, 0, 0, 0, 0);
	const end = new Date(start);
	end.setDate(end.getDate() + 1);
	return {
		label: `${formatLocalDateTime(start)} → ${formatLocalDateTime(end)}`,
		since: start.getTime(),
		until: end.getTime(),
	};
}

/** 以目标日期为基准偏移若干天，返回 YYYY-MM-DD。 */
export function localDateOffset(date: string, offsetDays: number): string {
	const [year, month, day] = date.split("-").map(Number);
	const dt = new Date(year, month - 1, day);
	dt.setDate(dt.getDate() + offsetDays);
	return getLocalDateString(dt);
}
