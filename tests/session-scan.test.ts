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
