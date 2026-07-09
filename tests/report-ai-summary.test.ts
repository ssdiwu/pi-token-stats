import assert from "node:assert/strict";
import test from "node:test";

import { buildSummaryFacts } from "../src/report-ai-summary.ts";
import { buildReportModel } from "../src/report-model.ts";

const report = buildReportModel({
	date: "2026-06-12",
	now: new Date("2026-06-12T00:00:00.000Z"),
	sessions: [
		{
			file: "/tmp/session-a.jsonl",
			header: { type: "session", id: "s1", cwd: "/repo/pi-session-insights" },
			entries: [
				{ type: "message", timestamp: "2026-06-12T09:00:00.000Z", message: { role: "user", content: "实现日报 MVP" } },
				{ type: "message", timestamp: "2026-06-12T09:01:00.000Z", message: { role: "assistant", content: "已完成日报并保存" } },
			],
		},
	],
});

test("buildSummaryFacts returns structured facts", () => {
	const facts = buildSummaryFacts(report, 5);
	assert.equal(facts.projects[0].name, "pi-session-insights");
	assert.match(facts.generatedAt, /^2026-06-12 \d{2}:\d{2}:\d{2}$/);
	assert.match(facts.window, /2026-06-12 00:00 → 2026-06-13 00:00/);
});
