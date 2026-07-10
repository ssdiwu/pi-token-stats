import assert from "node:assert/strict";
import test from "node:test";

import { isDailyCommand, parseDailyCommand, resolveDailyCommandWindows } from "../src/daily-command.ts";
import { isDayReportRequest } from "../src/insights.ts";

test("日报仅接受 daily 子命令", () => {
	assert.equal(isDayReportRequest("daily"), true);
	assert.equal(isDayReportRequest("report"), false);
	assert.equal(isDayReportRequest("today report"), false);
});

test("daily 子命令识别参数并解析项目和日界", () => {
	assert.equal(isDailyCommand("daily --day-start 03:00 --project current"), true);
	assert.deepEqual(parseDailyCommand("daily --day-start 03:00 --project current"), {
		dayStart: "03:00",
		projectCurrent: true,
		expression: "",
	});
});

test("缺少或无效选项参数时拒绝执行", () => {
	assert.throws(() => parseDailyCommand("daily --day-start"), /requires HH:mm/);
	assert.throws(() => parseDailyCommand("daily --project --day-start 03:00"), /requires a value/);
	assert.throws(() => parseDailyCommand("daily --project other"), /only supports current/);
});

test("显式 day-start 接入 daily 子命令时间窗口", async () => {
	const windows = await resolveDailyCommandWindows(parseDailyCommand("daily --day-start 03:00"), {} as never, "zh-CN", new Date(2026, 6, 10, 4, 30, 0));
	assert.equal(windows.length, 1);
	assert.equal(windows[0].date, "2026-07-10");
	assert.equal(windows[0].range.since, new Date(2026, 6, 10, 3, 0, 0).getTime());
});

test("非 ISO 或无效日历日期被拒绝", async () => {
	await assert.rejects(resolveDailyCommandWindows(parseDailyCommand("daily 2026/02/30"), {} as never, "zh-CN"), /invalid report date/);
	await assert.rejects(resolveDailyCommandWindows(parseDailyCommand("daily 2026-02-30"), {} as never, "zh-CN"), /invalid report date/);
});

test("日期范围接入 daily 子命令并逐日展开", async () => {
	const windows = await resolveDailyCommandWindows(parseDailyCommand("daily 2026-07-07 到 2026-07-09"), {} as never, "zh-CN");
	assert.deepEqual(windows.map((window) => window.date), ["2026-07-07", "2026-07-08", "2026-07-09"]);
});
