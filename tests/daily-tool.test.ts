import test from "node:test";
import assert from "node:assert/strict";
import extension from "../index.ts";

function registerTools(): any[] {
	const tools: any[] = [];
	extension({ registerTool: (x: any) => tools.push(x), registerCommand: () => {} } as any);
	return tools;
}

test("daily tool 注册并渲染日报结果", () => {
	const daily = registerTools().find((t) => t.name === "daily");
	assert.ok(daily, "daily tool 应被注册");
	const theme = { fg: (_: string, s: string) => s };
	const r = { content: [{ type: "text", text: "工作日报\n\n# 内容" }] };
	assert.match(daily.renderResult(r, { expanded: false, isPartial: false }, theme).render(80).join("\n"), /工作日报/);
	assert.match(daily.renderResult(r, { expanded: true, isPartial: false }, theme).render(80).join("\n"), /# 内容/);
	assert.match(daily.renderResult(r, { expanded: false, isPartial: true }, theme).render(80).join("\n"), /正在生成日报/);
});

test("daily tool 暴露结构化参数", () => {
	const daily = registerTools().find((t) => t.name === "daily");
	const keys = Object.keys(daily.parameters.properties);
	for (const key of ["date", "range", "projectCurrent", "dayStart"]) {
		assert.ok(keys.includes(key), `daily tool 应有 ${key} 参数`);
	}
});

test("insights 与 daily 是两个独立 tool，insights 不含 daily 参数", () => {
	const tools = registerTools();
	const names = tools.map((t) => t.name);
	assert.ok(names.includes("insights"));
	assert.ok(names.includes("daily"));
	const insights = tools.find((t) => t.name === "insights");
	assert.ok(!Object.keys(insights.parameters.properties).includes("date"), "insights tool 不应有 daily 的 date 参数");
	assert.match(insights.promptGuidelines.join("\n"), /Do not use insights to generate daily reports/);
	const daily = tools.find((t) => t.name === "daily");
	assert.match(daily.promptGuidelines.join("\n"), /one file per day/);
});
