import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { saveDailyReport } from "../src/daily-archive.ts";
import { getDailyConfigPath, readDailyConfig } from "../src/daily-config.ts";

test("配置文件覆盖默认归档目录", async () => {
	const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-daily-config-"));
	try {
		const configPath = getDailyConfigPath(homeDir);
		await fs.mkdir(path.dirname(configPath), { recursive: true });
		await fs.writeFile(configPath, JSON.stringify({ reportOutputDir: "/custom/reports", dailyModel: "openai-codex/gpt-5.6-sol:xhigh" }), "utf8");
		assert.deepEqual(await readDailyConfig(homeDir), { outputDir: "/custom/reports", dailyModel: "openai-codex/gpt-5.6-sol:xhigh" });
	} finally {
		await fs.rm(homeDir, { recursive: true, force: true });
	}
});

test("同日期日报稳定覆盖配置目录文件", async () => {
	const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-daily-archive-"));
	try {
		const first = await saveDailyReport("2026-07-10", "# v1", outputDir);
		const second = await saveDailyReport("2026-07-10", "# v2", outputDir);
		assert.equal(first.overwritten, false);
		assert.equal(second.overwritten, true);
		assert.equal(await fs.readFile(second.path, "utf8"), "# v2");
	} finally {
		await fs.rm(outputDir, { recursive: true, force: true });
	}
});
