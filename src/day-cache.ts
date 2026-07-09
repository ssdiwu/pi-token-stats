// 按天摘要缓存层。
// 跨天聚合读"天摘要"而非会话原文，避免主代理一次性吞超量内容。
// 缓存放 Pi 标准数据目录 ~/.pi/agent/session-insights/day-YYYY-MM-DD.json（不硬编码 ~/Documents）。
// 确定性部分（量纲+多维）纯算法；narrative 叙事在 day-summary.ts 用 LLM 或规则回退填充。

import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { rollupDimensions } from "./dimensions.ts";
import { rollupSessions } from "./usage-rollup.ts";
import type { DaySummary, SessionFile, TimeRange } from "./types.ts";

export function getCacheDir(homeDir = os.homedir()): string {
	return path.join(homeDir, ".pi", "agent", "session-insights");
}

export function dayFilePath(date: string, homeDir = os.homedir()): string {
	return path.join(getCacheDir(homeDir), `day-${date}.json`);
}

export function localDayRange(date: string): TimeRange {
	const [year, month, day] = date.split("-").map(Number);
	const since = new Date(year, month - 1, day, 0, 0, 0, 0).getTime();
	const until = new Date(year, month - 1, day + 1, 0, 0, 0, 0).getTime();
	return { label: date, since, until };
}

export async function readDaySummary(date: string, homeDir = os.homedir()): Promise<DaySummary | null> {
	try {
		const content = await fs.readFile(dayFilePath(date, homeDir), "utf8");
		const parsed = JSON.parse(content) as DaySummary;
		if (parsed && parsed.date === date) return parsed;
		return null;
	} catch {
		return null;
	}
}

export async function writeDaySummary(summary: DaySummary, homeDir = os.homedir()): Promise<void> {
	await fs.mkdir(getCacheDir(homeDir), { recursive: true });
	await fs.writeFile(dayFilePath(summary.date, homeDir), JSON.stringify(summary, null, 2), "utf8");
}

// 纯算法：按指定范围聚合确定性数据（量纲 + 多维 + 模型），不调 LLM。
export function buildDeterministicSummary(date: string, range: TimeRange, sessions: SessionFile[]): DaySummary {
	const { stats, models, sessions: sessionRollups } = rollupSessions(sessions, range);
	const dimensions = rollupDimensions(sessions, range);
	return {
		date,
		since: range.since,
		until: range.until,
		stats,
		sessionCount: sessionRollups.length,
		models,
		dimensions,
		narrativeSource: "none",
		generatedAt: new Date().toISOString(),
	};
}

export function buildDayDeterministic(date: string, sessions: SessionFile[]): DaySummary {
	return buildDeterministicSummary(date, localDayRange(date), sessions);
}

function localDateString(date = new Date()): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, "0");
	const day = String(date.getDate()).padStart(2, "0");
	return `${year}-${month}-${day}`;
}

// 增量补跑：今天重算确定性（数据在变）+ 保留缓存 narrative；历史天完全缓存。
export async function ensureDaySummary(date: string, sessions: SessionFile[], homeDir = os.homedir()): Promise<DaySummary> {
	const cached = await readDaySummary(date, homeDir);
	if (cached) {
		if (date === localDateString()) {
			// 今天：确定性 fresh，保留已缓存 narrative（enrichDaySummary 命中后不重调 LLM）
			const fresh = buildDayDeterministic(date, sessions);
			fresh.narrative = cached.narrative;
			fresh.narrativeSource = cached.narrativeSource;
			await writeDaySummary(fresh, homeDir);
			return fresh;
		}
		return cached;
	}
	const summary = buildDayDeterministic(date, sessions);
	await writeDaySummary(summary, homeDir);
	return summary;
}

// 批量补跑多天：返回有序 DaySummary[]（跨天聚合用）。
export async function ensureDaySummaries(dates: string[], sessions: SessionFile[], homeDir = os.homedir()): Promise<DaySummary[]> {
	const results: DaySummary[] = [];
	for (const date of dates) {
		results.push(await ensureDaySummary(date, sessions, homeDir));
	}
	return results;
}
