import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { scanSessions } from "../src/session-scan.ts";

test("scanSessions 跳过修改时间早于当天的会话文件", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "psi-scan-filter-"));
	try {
		const oldFile = path.join(directory, "old.jsonl");
		const todayFile = path.join(directory, "today.jsonl");
		const cutoff = new Date(2026, 6, 10, 0, 0, 0).getTime();
		await fs.writeFile(oldFile, '{"type":"session","id":"old"}\n', "utf8");
		await fs.writeFile(todayFile, '{"type":"session","id":"today"}\n', "utf8");
		await fs.utimes(oldFile, new Date(cutoff - 1_000), new Date(cutoff - 1_000));
		await fs.utimes(todayFile, new Date(cutoff + 1_000), new Date(cutoff + 1_000));

		const result = await scanSessions({ files: [oldFile, todayFile], modifiedSince: cutoff } as unknown as Parameters<typeof scanSessions>[0]);

		assert.deepEqual(result.files, [todayFile]);
		assert.deepEqual(result.sessions.map((session) => session.file), [todayFile]);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("scanSessions 保持输入文件顺序并汇总坏行错误", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "psi-scan-"));
	try {
		const first = path.join(directory, "first.jsonl");
		const second = path.join(directory, "second.jsonl");
		await fs.writeFile(first, '{"type":"session","id":"first"}\n', "utf8");
		await fs.writeFile(second, '{"type":"session","id":"second"}\nnot-json\n', "utf8");

		const result = await scanSessions({ files: [second, first] });

		assert.deepEqual(result.sessions.map((session) => session.file), [second, first]);
		assert.equal(result.errors.length, 1);
		assert.equal(result.errors[0].file, second);
		assert.equal(result.errors[0].line, 2);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("scanSessions 只保留范围内事件与会话元数据", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "psi-scan-range-"));
	try {
		const file = path.join(directory, "session.jsonl");
		const lines = [
			{ type: "session", id: "fixture", cwd: "/tmp/project" },
			{ type: "session_info", name: "Fixture" },
			{ type: "message", timestamp: "2026-07-17T12:00:00.000Z", message: { role: "user", timestamp: "2026-07-17T12:00:00.000Z", content: "old" } },
			{ type: "message", timestamp: "2026-07-18T12:00:00.000Z", message: { role: "user", timestamp: "2026-07-18T12:00:00.000Z", content: "inside" } },
			{ type: "message", timestamp: "2026-07-20T12:00:00.000Z", message: { role: "user", timestamp: "2026-07-20T12:00:00.000Z", content: "new" } },
		];
		await fs.writeFile(file, `${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, "utf8");

		const result = await scanSessions({
			files: [file],
			entryRange: {
				since: Date.parse("2026-07-18T00:00:00.000Z"),
				until: Date.parse("2026-07-20T00:00:00.000Z"),
			},
		} as never);

		assert.deepEqual(result.sessions[0].entries.map((entry) => entry.type), ["session", "session_info", "message"]);
		assert.equal(result.sessions[0].entries[2].message?.content, "inside");
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});

test("scanSessions 按 usage-rollup 口径回退外层 timestamp", async () => {
	const directory = await fs.mkdtemp(path.join(os.tmpdir(), "psi-scan-timestamp-"));
	try {
		const file = path.join(directory, "session.jsonl");
		await fs.writeFile(file, [
			JSON.stringify({ type: "session", id: "fixture" }),
			JSON.stringify({ type: "message", timestamp: "2026-07-18T12:00:00.000Z", message: { role: "assistant", timestamp: "not-a-date", usage: { totalTokens: 7 } } }),
		].join("\n") + "\n", "utf8");
		const result = await scanSessions({ files: [file], entryRange: { since: Date.parse("2026-07-18T00:00:00.000Z"), until: Date.parse("2026-07-19T00:00:00.000Z") } });
		assert.equal(result.sessions[0].entries.length, 2);
	} finally {
		await fs.rm(directory, { recursive: true, force: true });
	}
});
