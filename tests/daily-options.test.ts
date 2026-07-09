import assert from "node:assert/strict";
import test from "node:test";

import { expandDailyDateRange, resolveDefaultDailyWindow, resolveExplicitDayStartWindow } from "../src/daily-options.ts";

test("默认日报在 00:00 整点归昨天且截止当前时刻", () => {
	const now = new Date(2026, 6, 10, 0, 0, 0);
	const selection = resolveDefaultDailyWindow(now);

	assert.equal(selection.date, "2026-07-09");
	assert.equal(selection.range.since, new Date(2026, 6, 9, 5, 0, 0).getTime());
	assert.equal(selection.range.until, now.getTime());
});

test("默认日报在 00:00–05:00 归昨天且截止当前时刻", () => {
	const now = new Date(2026, 6, 10, 0, 30, 0);
	const selection = resolveDefaultDailyWindow(now);

	assert.equal(selection.date, "2026-07-09");
	assert.equal(selection.range.since, new Date(2026, 6, 9, 5, 0, 0).getTime());
	assert.equal(selection.range.until, now.getTime());
});

test("默认日报在 05:00 后归当天自然日且截止当前时刻", () => {
	const now = new Date(2026, 6, 10, 5, 0, 0);
	const selection = resolveDefaultDailyWindow(now);

	assert.equal(selection.date, "2026-07-10");
	assert.equal(selection.range.since, new Date(2026, 6, 10, 0, 0, 0).getTime());
	assert.equal(selection.range.until, now.getTime());
});

test("显式 day-start 覆盖默认日界", () => {
	const now = new Date(2026, 6, 10, 4, 30, 0);
	const selection = resolveExplicitDayStartWindow(now, "03:00");

	assert.equal(selection.date, "2026-07-10");
	assert.equal(selection.range.since, new Date(2026, 6, 10, 3, 0, 0).getTime());
	assert.equal(selection.range.until, now.getTime());
});

test("多天范围展开为连续稳定日报日期", () => {
	assert.deepEqual(expandDailyDateRange("2026-07-07", "2026-07-10"), ["2026-07-07", "2026-07-08", "2026-07-09", "2026-07-10"]);
});

test("无效日历日期被拒绝而不静默改写", () => {
	assert.throws(() => expandDailyDateRange("2026-02-30", "2026-02-30"), /invalid report date/);
	assert.throws(() => expandDailyDateRange("2026-00-01", "2026-00-01"), /invalid report date/);
});
