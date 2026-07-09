// Obsidian 落点单元测试（task 24）。临时 homeDir + 假 obsidian.json + 临时 vault，不污染真实环境。

import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import os from "node:os";
import path from "node:path";
import { promises as fs } from "node:fs";

import { detectObsidianVaults, resolveVaultPath, saveDayReportToVault, saveReportToVault } from "../src/obsidian-sync.ts";

const tmpHome = path.join(os.tmpdir(), `psi-obs-test-${Date.now()}-${process.pid}`);
const tmpVault = path.join(tmpHome, "test-vault");

async function writeFakeObsidianConfig(homeDir: string, vaults: Record<string, unknown>): Promise<void> {
	const obsDir = path.join(homeDir, "Library", "Application Support", "obsidian");
	await fs.mkdir(obsDir, { recursive: true });
	await fs.writeFile(path.join(obsDir, "obsidian.json"), JSON.stringify({ vaults }));
}

before(async () => {
	await fs.mkdir(tmpVault, { recursive: true });
	await writeFakeObsidianConfig(tmpHome, {
		"id-open": { path: tmpVault, open: true },
		"id-closed": { path: "/nonexistent-closed", open: false },
	});
});

after(async () => {
	await fs.rm(tmpHome, { recursive: true, force: true });
});

test("detectObsidianVaults 读注册表", async () => {
	const vaults = await detectObsidianVaults(tmpHome);
	assert.equal(vaults.length, 2);
	const open = vaults.find((v) => v.id === "id-open");
	assert.ok(open);
	assert.equal(open!.path, tmpVault);
	assert.equal(open!.open, true);
});

test("resolveVaultPath open:true 优先", async () => {
	const resolved = await resolveVaultPath({ homeDir: tmpHome });
	assert.equal(resolved, tmpVault);
});

test("resolveVaultPath 显式 vault 覆盖探测", async () => {
	const explicit = path.join(tmpHome, "explicit-vault");
	await fs.mkdir(explicit, { recursive: true });
	const resolved = await resolveVaultPath({ vault: explicit, homeDir: tmpHome });
	assert.equal(resolved, explicit);
});

test("resolveVaultPath 无注册返回 null", async () => {
	const emptyHome = path.join(os.tmpdir(), `psi-empty-${Date.now()}`);
	await fs.mkdir(emptyHome, { recursive: true });
	const resolved = await resolveVaultPath({ homeDir: emptyHome });
	assert.equal(resolved, null);
	await fs.rm(emptyHome, { recursive: true, force: true });
});

test("saveReportToVault 写入正确路径", async () => {
	const result = await saveReportToVault("test-a.md", "# A", { vault: tmpVault });
	assert.equal(result.overwritten, false);
	assert.equal(result.path, path.join(tmpVault, "会话日报", "test-a.md"));
	const content = await fs.readFile(result.path, "utf8");
	assert.equal(content, "# A");
});

test("saveReportToVault 同名重跑幂等覆盖", async () => {
	const first = await saveReportToVault("test-b.md", "# v1", { vault: tmpVault });
	assert.equal(first.overwritten, false);
	const second = await saveReportToVault("test-b.md", "# v2", { vault: tmpVault });
	assert.equal(second.overwritten, true);
	const content = await fs.readFile(second.path, "utf8");
	assert.equal(content, "# v2");
});

test("saveDayReportToVault 日期文件名", async () => {
	const result = await saveDayReportToVault("2026-07-08", "# 日报", { vault: tmpVault });
	assert.ok(result.path.endsWith("2026-07-08.md"));
	assert.equal(result.vault, tmpVault);
});

test("saveReportToVault 自定义子目录", async () => {
	const result = await saveReportToVault("test-c.md", "# C", { vault: tmpVault, subdir: "diary" });
	assert.equal(result.path, path.join(tmpVault, "diary", "test-c.md"));
});
