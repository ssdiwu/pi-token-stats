// Obsidian vault 探测 + 日报落点（Phase 5）。
// 读 ~/Library/Application Support/obsidian/obsidian.json 注册表取 open:true vault；
// 多 vault/无注册回退用户配置；日报写 <vault>/<子目录>/YYYY-MM-DD.md，幂等覆盖。
// 不硬编码本地路径偏好：vault 走探测/配置，子目录默认值可被 options 覆盖。

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

export interface DetectedVault {
	id: string;
	path: string;
	open: boolean;
}

export function obsidianConfigPath(homeDir = os.homedir()): string {
	return path.join(homeDir, "Library", "Application Support", "obsidian", "obsidian.json");
}

export async function detectObsidianVaults(homeDir = os.homedir()): Promise<DetectedVault[]> {
	try {
		const content = await fs.readFile(obsidianConfigPath(homeDir), "utf8");
		const config: any = JSON.parse(content);
		const vaults: any = config?.vaults;
		if (!vaults || typeof vaults !== "object") return [];
		return Object.entries(vaults)
			.map(([id, value]: [string, any]) => ({
				id,
				path: value?.path ?? "",
				open: Boolean(value?.open),
			}))
			.filter((vault) => vault.path);
	} catch {
		return [];
	}
}

// 解析 vault 路径：显式 vault > 配置 vault > 探测 open:true > 探测第一个。
export async function resolveVaultPath(options: { vault?: string; configuredVault?: string; homeDir?: string } = {}): Promise<string | null> {
	if (options.vault) {
		try {
			await fs.access(options.vault);
			return options.vault;
		} catch {
			// 显式指定但不可访问，继续探测
		}
	}
	if (options.configuredVault) {
		try {
			await fs.access(options.configuredVault);
			return options.configuredVault;
		} catch {
			// ignore
		}
	}
	const vaults = await detectObsidianVaults(options.homeDir);
	const openVault = vaults.find((vault) => vault.open);
	if (openVault) return openVault.path;
	return vaults[0]?.path ?? null;
}

export interface SaveReportOptions {
	vault?: string; // 显式指定 vault（最高优先级，覆盖探测）
	configuredVault?: string; // 配置的 vault（探测回退）
	subdir?: string; // vault 下子目录，默认 "会话日报"
	homeDir?: string;
}

export interface SaveReportResult {
	path: string;
	overwritten: boolean;
	vault: string;
}

export async function saveReportToVault(filename: string, content: string, options: SaveReportOptions = {}): Promise<SaveReportResult> {
	const vault = await resolveVaultPath({ vault: options.vault, configuredVault: options.configuredVault, homeDir: options.homeDir });
	if (!vault) throw new Error("未找到 Obsidian vault：无 obsidian.json 注册表，且未配置 vault 路径");

	const subdir = options.subdir ?? "会话日报";
	const dir = path.join(vault, subdir);
	await fs.mkdir(dir, { recursive: true });

	const filePath = path.join(dir, filename);
	let overwritten = false;
	try {
		await fs.access(filePath);
		overwritten = true;
	} catch {
		// 文件不存在
	}
	await fs.writeFile(filePath, content, "utf8");
	return { path: filePath, overwritten, vault };
}

// 日报专用：写 <vault>/<子目录>/YYYY-MM-DD.md，同日重跑幂等覆盖。
export async function saveDayReportToVault(date: string, markdown: string, options: SaveReportOptions = {}): Promise<SaveReportResult> {
	return saveReportToVault(`${date}.md`, markdown, options);
}
