import assert from "node:assert/strict";
import test from "node:test";

import { InsightsPanel } from "../src/panel.ts";

const theme = { fg: (_color: string, text: string) => text } as never;

test("日报视图限制预览行数并提示完整日报命令", () => {
	const panel = new InsightsPanel(
		{
			numericTitle: "今天",
			numericBody: "数字",
			dailyTitle: "昨天日报",
			dailyBody: Array.from({ length: 30 }, (_value, index) => `日报第 ${index + 1} 行`).join("\n"),
			dailyPreviewHint: "… 完整日报请运行 /insights daily",
		},
		theme,
		() => {},
	);

	panel.handleInput("2");
	const output = panel.render(80).join("\n");

	assert.match(output, /日报第 1 行/);
	assert.doesNotMatch(output, /日报第 30 行/);
	assert.match(output, /完整日报请运行 \/insights daily/);
});
