import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { parseDailyModelSelector, readDailyConfig, resolveDailyConfig, resolveDailyModel, selectDailyModel } from "../src/daily-config.ts";

test("默认日报配置使用 Documents 归档目录", () => {
	const config = resolveDailyConfig({}, "/tmp/home");
	assert.equal(config.outputDir, "/tmp/home/Documents/pi-daily-reports");
	assert.equal(config.dailyModel, undefined);
});

test("自定义日报目录覆盖默认值", () => {
	const config = resolveDailyConfig({ reportOutputDir: "/reports/daily" }, "/tmp/home");
	assert.equal(config.outputDir, "/reports/daily");
});

test("日报模型选择器解析 provider/model:thinking", () => {
	assert.deepEqual(parseDailyModelSelector("openai-codex/gpt-5.6-sol:xhigh"), {
		provider: "openai-codex",
		modelId: "gpt-5.6-sol",
		thinking: "xhigh",
	});
});

test("模型 id 内的冒号不是 thinking 后缀", () => {
	assert.deepEqual(parseDailyModelSelector("ollama/qwen3:latest"), {
		provider: "ollama",
		modelId: "qwen3:latest",
		thinking: undefined,
	});
});

test("配置模型可用时优先使用配置模型与 thinking", () => {
	const configured = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const selection = selectDailyModel([configured], { provider: "openai-codex", id: "gpt-5.6-terra" }, "openai-codex/gpt-5.6-sol:xhigh");

	assert.equal(selection.model, configured);
	assert.equal(selection.thinking, "xhigh");
	assert.equal(selection.source, "configured");
});

test("配置模型不可用时回退当前会话模型并记录原因", () => {
	const current = { provider: "openai-codex", id: "gpt-5.6-terra" };
	const selection = selectDailyModel(
		[{ provider: "openai-codex", id: "gpt-5.6-terra" }],
		current,
		"openai-codex/gpt-5.6-sol:xhigh",
	);

	assert.equal(selection.model, current);
	assert.equal(selection.source, "current-fallback");
	assert.match(selection.notice || "", /gpt-5\.6-sol/);
});


test("resolveDailyModel 从上下文解析配置模型", () => {
	const configured = { provider: "openai-codex", id: "gpt-5.6-sol" };
	const current = { provider: "openai-codex", id: "gpt-5.6-terra" };
	const registry = { getAvailable: () => [configured, current] };
	const selection = resolveDailyModel({ model: current, modelRegistry: registry }, { dailyModel: "openai-codex/gpt-5.6-sol:xhigh" });

	assert.equal(selection.model, configured);
	assert.equal(selection.thinking, "xhigh");
	assert.equal(selection.source, "configured");
});

test("resolveDailyModel 无配置时回退当前模型", () => {
	const current = { provider: "openai-codex", id: "gpt-5.6-terra" };
	const registry = { getAvailable: () => [current] };
	const selection = resolveDailyModel({ model: current, modelRegistry: registry }, {});

	assert.equal(selection.model, current);
	assert.equal(selection.source, "current");
});

test("配置 JSON 损坏时 readDailyConfig 抛出可诊断错误", async () => {
	const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "psi-bad-config-"));
	await fs.mkdir(path.join(tmpDir, ".pi", "agent"), { recursive: true });
	await fs.writeFile(path.join(tmpDir, ".pi", "agent", "pi-session-insights.json"), "not-json", "utf8");
	await assert.rejects(() => readDailyConfig(tmpDir), /JSON/);
});
