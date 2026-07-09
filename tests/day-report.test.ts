import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildDayDeterministic, writeDaySummary } from "../src/day-cache.ts";
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
