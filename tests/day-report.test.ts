import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDayDeterministic, readDaySummary, writeDaySummary } from "../src/day-cache.ts";
import { buildDayReport } from "../src/day-report.ts";

const date = "2020-01-02";

test("历史日报缓存命中时直接返回缓存正文", async () => {
	const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-day-report-"));
	try {
		const summary = buildDayDeterministic(date, []);
		await writeDaySummary(
			{
				...summary,
				reportMarkdown: "# Cached report",
				reportLocale: "zh-CN",
				reportSource: "fallback",
			},
			homeDir,
		);

		const result = await buildDayReport(date, [], "zh-CN", { homeDir });

		assert.equal(result.markdown, "# Cached report\n");
		assert.equal(result.source, "fallback");
		assert.deepEqual(result.report.projects, []);
	} finally {
		await fs.rm(homeDir, { recursive: true, force: true });
	}
});

test("范围日报写回与正文一致的缓存元数据", async () => {
	const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-day-range-"));
	const range = { label: "partial", since: new Date(2020, 0, 2, 5, 0, 0).getTime(), until: new Date(2020, 0, 2, 10, 0, 0).getTime() };
	try {
		await buildDayReport(date, [], "zh-CN", { homeDir, range, forceRefresh: true });
		const cached = await readDaySummary(date, homeDir);
		assert.equal(cached?.since, range.since);
		assert.equal(cached?.until, range.until);
	} finally {
		await fs.rm(homeDir, { recursive: true, force: true });
	}
});
