import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { buildInteractiveReport } from "../src/insights.ts";

test("临时配置经 /insights daily 写入指定归档目录", async () => {
	const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-insights-daily-"));
	const previousHome = process.env.HOME;
	try {
		process.env.HOME = homeDir;
		const outputDir = path.join(homeDir, "reports");
		await fs.mkdir(path.join(homeDir, ".pi", "agent", "sessions", "project"), { recursive: true });
		await fs.writeFile(path.join(homeDir, ".pi", "agent", "pi-session-insights.json"), JSON.stringify({ reportOutputDir: outputDir }));
		await fs.writeFile(
			path.join(homeDir, ".pi", "agent", "sessions", "project", "session.jsonl"),
			`${JSON.stringify({ type: "session", id: "test", cwd: "/tmp/project" })}\n`,
		);

		const report = await buildInteractiveReport("daily 2020-01-02", {
			hasUI: false,
			cwd: "/tmp/project",
			modelRegistry: { getAvailable: () => [] },
		} as never, "zh-CN");

		const archive = path.join(outputDir, "2020-01-02.md");
		assert.match(report.body, /已归档/);
		assert.match(await fs.readFile(archive, "utf8"), /2020-01-02/);
	} finally {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		await fs.rm(homeDir, { recursive: true, force: true });
	}
});

test("日期范围逐日生成独立归档", async () => {
	const homeDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-insights-range-"));
	const previousHome = process.env.HOME;
	try {
		process.env.HOME = homeDir;
		const outputDir = path.join(homeDir, "reports");
		await fs.mkdir(path.join(homeDir, ".pi", "agent", "sessions"), { recursive: true });
		await fs.writeFile(path.join(homeDir, ".pi", "agent", "pi-session-insights.json"), JSON.stringify({ reportOutputDir: outputDir }));
		const report = await buildInteractiveReport("daily 2020-01-02 到 2020-01-03", { hasUI: false, cwd: "/tmp/project", modelRegistry: { getAvailable: () => [] } } as never, "zh-CN");
		assert.match(report.body, /已生成并归档 2 篇日报/);
		await Promise.all(["2020-01-02.md", "2020-01-03.md"].map((file) => fs.access(path.join(outputDir, file))));
	} finally {
		if (previousHome === undefined) delete process.env.HOME;
		else process.env.HOME = previousHome;
		await fs.rm(homeDir, { recursive: true, force: true });
	}
});

test("UI 拒绝多天补写时正常取消且按 locale 显示", async () => {
	let title = "";
	const report = await buildInteractiveReport("daily 2020-01-02 到 2020-01-03", {
		hasUI: true,
		cwd: "/tmp/project",
		ui: { confirm: async (value: string) => { title = value; return false; } },
		modelRegistry: { getAvailable: () => [] },
	} as never, "en");
	assert.equal(title, "Generate daily reports?");
	assert.match(report.body, /batch cancelled/);
	assert.equal(report.stats.totalTokens, 0);
});
