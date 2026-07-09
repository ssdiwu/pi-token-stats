import assert from "node:assert/strict";
import test from "node:test";

import { InsightsPanel, type PanelData } from "../src/panel.ts";

const theme = { fg: (_color: string, text: string) => text } as never;

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((done) => {
		resolve = done;
	});
	return { promise, resolve };
}

async function flushAsyncWork(): Promise<void> {
	await new Promise((resolve) => setImmediate(resolve));
	await new Promise((resolve) => setImmediate(resolve));
}

test("面板先显示加载态，数据完成后再重绘内容", async () => {
	const load = deferred<PanelData>();
	let renders = 0;
	const panel = new InsightsPanel(
		{
			load: () => load.promise,
			loadingTitle: "会话洞察",
			loadingBody: "正在加载会话洞察…",
			errorTitle: "会话洞察",
			errorBody: (message: string) => `加载失败：${message}`,
		},
		{ requestRender: () => { renders += 1; } },
		theme,
		() => {},
	);

	assert.match(panel.render(80).join("\n"), /正在加载会话洞察/);
	load.resolve({
		numericTitle: "今天",
		numericBody: "数字内容",
		dailyTitle: "昨天日报",
		dailyBody: "日报内容",
		dailyPreviewHint: "完整日报",
	});
	await flushAsyncWork();

	assert.ok(renders >= 2);
	assert.match(panel.render(80).join("\n"), /数字内容/);
});

test("关闭面板后，未完成加载不得请求重绘", async () => {
	const load = deferred<PanelData>();
	let renders = 0;
	let done = 0;
	const panel = new InsightsPanel(
		{
			load: () => load.promise,
			loadingTitle: "会话洞察",
			loadingBody: "正在加载会话洞察…",
			errorTitle: "会话洞察",
			errorBody: (message: string) => `加载失败：${message}`,
		},
		{ requestRender: () => { renders += 1; } },
		theme,
		() => { done += 1; },
	);

	panel.handleInput("\u001b");
	const rendersAtClose = renders;
	load.resolve({ numericTitle: "今天", numericBody: "数字", dailyTitle: "昨天", dailyBody: "日报", dailyPreviewHint: "完整日报" });
	await flushAsyncWork();

	assert.equal(done, 1);
	assert.equal(renders, rendersAtClose);
});
