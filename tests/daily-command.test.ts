import assert from "node:assert/strict";
import test from "node:test";

import { buildDailyRequest, parseDailyCommand, resolveDailyCommandWindows } from "../src/daily-command.ts";

test("解析命令参数并提取项目和日界", () => {
	assert.deepEqual(parseDailyCommand("--day-start 03:00 --project current"), {
		dayStart: "03:00",
		projectCurrent: true,
		expression: "",
	});
});

test("缺少或无效选项参数时拒绝执行", () => {
	assert.throws(() => parseDailyCommand("--day-start"), /requires HH:mm/);
	assert.throws(() => parseDailyCommand("--project --day-start 03:00"), /requires a value/);
	assert.throws(() => parseDailyCommand("--project other"), /only supports current/);
});

test("未知或冲突选项被拒绝", async () => {
	assert.throws(() => parseDailyCommand("--unexpected"), /unsupported daily option/);
	assert.throws(() => parseDailyCommand("-x"), /unsupported daily option/);
	await assert.rejects(resolveDailyCommandWindows(parseDailyCommand("2026-07-01 --day-start 05:00"), {} as never, "zh-CN"), /cannot be combined/);
});

test("显式 day-start 接入时间窗口", async () => {
	const windows = await resolveDailyCommandWindows(parseDailyCommand("--day-start 03:00"), {} as never, "zh-CN", new Date(2026, 6, 10, 4, 30, 0));
	assert.equal(windows.length, 1);
	assert.equal(windows[0].date, "2026-07-10");
	assert.equal(windows[0].range.since, new Date(2026, 6, 10, 3, 0, 0).getTime());
});

test("非 ISO、无效或不完整显式日期被拒绝", async () => {
	for (const input of ["2026", "2026-07", "2026/07", "2026/02/30", "2026-02-30", "2026-07-01 nonsense", "2026-07-01 到", "2026-07-01 2026-07-03"]) {
		await assert.rejects(resolveDailyCommandWindows(parseDailyCommand(input), {} as never, "zh-CN"), /invalid report date/);
	}
});

test("日期范围逐日展开", async () => {
	const windows = await resolveDailyCommandWindows(parseDailyCommand("2026-07-07 到 2026-07-09"), {} as never, "zh-CN");
	assert.deepEqual(windows.map((window) => window.date), ["2026-07-07", "2026-07-08", "2026-07-09"]);
	const slashWindows = await resolveDailyCommandWindows(parseDailyCommand("2026/07/07 到 2026/07/09"), {} as never, "zh-CN");
	assert.deepEqual(slashWindows.map((window) => window.date), ["2026-07-07", "2026-07-08", "2026-07-09"]);
});

test("中文月日范围按当前年份展开", async () => {
	const windows = await resolveDailyCommandWindows(
		parseDailyCommand("7月18日到7月19日"),
		{} as never,
		"zh-CN",
		new Date(2026, 6, 20, 10, 0, 0),
	);
	assert.deepEqual(windows.map((window) => window.date), ["2026-07-18", "2026-07-19"]);
});

test("日报命令识别自然语言中的 MMDD 日期范围", async () => {
	const windows = await resolveDailyCommandWindows(
		parseDailyCommand("写 0718 和 0719 的两天🇯🇵"),
		{} as never,
		"zh-CN",
		new Date(2026, 6, 20, 10, 0, 0),
	);
	assert.deepEqual(windows.map((window) => window.date), ["2026-07-18", "2026-07-19"]);
});

test("中文月日与 MMDD 范围支持跨年且拒绝非法日期", async () => {
	const monthDay = await resolveDailyCommandWindows(parseDailyCommand("12月31日到1月1日"), {} as never, "zh-CN", new Date(2026, 6, 20));
	assert.deepEqual(monthDay.map((window) => window.date), ["2026-12-31", "2027-01-01"]);
	const compact = await resolveDailyCommandWindows(parseDailyCommand("1231 和 0101"), {} as never, "zh-CN", new Date(2026, 6, 20));
	assert.deepEqual(compact.map((window) => window.date), ["2026-12-31", "2027-01-01"]);
	await assert.rejects(resolveDailyCommandWindows(parseDailyCommand("2月30日到3月1日"), {} as never, "zh-CN", new Date(2026, 6, 20)), /invalid date range/);
});

test("buildDailyRequest 把 tool 参数合并成请求（date 优先于 range）", () => {
	assert.deepEqual(buildDailyRequest({ date: "2026-07-08" }), { dayStart: undefined, projectCurrent: false, expression: "2026-07-08" });
	assert.deepEqual(buildDailyRequest({ range: "本周" }), { dayStart: undefined, projectCurrent: false, expression: "本周" });
	assert.deepEqual(buildDailyRequest({ date: "2026-07-08", range: "本周" }), { dayStart: undefined, projectCurrent: false, expression: "2026-07-08" });
	assert.deepEqual(buildDailyRequest({ projectCurrent: true, dayStart: "03:00" }), { dayStart: "03:00", projectCurrent: true, expression: "" });
	assert.deepEqual(buildDailyRequest({}), { dayStart: undefined, projectCurrent: false, expression: "" });
});
