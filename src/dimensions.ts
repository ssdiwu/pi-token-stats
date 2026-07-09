// 多维分析聚合层（K1 项目 / K2 工具 / K3 错误 / K5 上下文健康）。
// 全部纯算法，绝不调 LLM。数据源来自 Pi session JSONL 已记录的字段：
//   K1: session.header.cwd + session_info.name
//   K2/K3: toolResult.toolName + toolResult.isError
//   K5: compaction entry.tokensBefore

import { addStats, asNumber, emptyStats, entryTimestamp, rollupSessionFile } from "./usage-rollup.ts";
import type { ContextHealth, Dimensions, ErrorIntel, ProjectRollup, SessionEntry, SessionFile, TimeRange, ToolProfile } from "./types.ts";

function inRange(entry: SessionEntry, range: TimeRange): boolean {
	const ts = entryTimestamp(entry);
	return ts >= range.since && ts < range.until;
}

function sessionName(session: SessionFile): string {
	const nameEntry = session.entries.find((entry) => entry?.type === "session_info" && typeof entry.name === "string");
	return nameEntry?.name ?? session.file;
}

// K1 项目维度：按 cwd 归一化聚合各项目的会话量纲，输出项目排行榜。
export function rollupByProject(sessions: SessionFile[], range: TimeRange): ProjectRollup[] {
	const map = new Map<string, ProjectRollup>();
	for (const session of sessions) {
		const rollup = rollupSessionFile(session, range);
		if (!rollup) continue;
		const key = rollup.cwd ?? rollup.name;
		let project = map.get(key);
		if (!project) {
			project = { cwd: rollup.cwd ?? rollup.name, name: rollup.name, sessionCount: 0, stats: emptyStats() };
			map.set(key, project);
		}
		project.sessionCount++;
		addStats(project.stats, rollup.stats);
	}
	return [...map.values()].sort((left, right) => right.stats.totalTokens - left.stats.totalTokens);
}

// K2 工具画像：按 toolResult.toolName 统计调用次数与错误，识别 bash-heavy/edit-heavy/research-heavy。
export function rollupToolProfile(sessions: SessionFile[], range: TimeRange): ToolProfile[] {
	const map = new Map<string, ToolProfile>();
	for (const session of sessions) {
		for (const entry of session.entries) {
			if (entry.type !== "message") continue;
			const message = entry.message;
			if (message?.role !== "toolResult") continue;
			if (!inRange(entry, range)) continue;
			const name = message.toolName ?? "unknown";
			let tool = map.get(name);
			if (!tool) {
				tool = { name, calls: 0, errors: 0 };
				map.set(name, tool);
			}
			tool.calls++;
			if (message.isError) tool.errors++;
		}
	}
	return [...map.values()].sort((left, right) => right.calls - left.calls);
}

// K3 错误情报：错误率、按工具错误来源 TOP（基于 toolResult.isError）。
export function rollupErrorIntel(sessions: SessionFile[], range: TimeRange): ErrorIntel {
	const profile = rollupToolProfile(sessions, range);
	const totalToolResults = profile.reduce((sum, tool) => sum + tool.calls, 0);
	const errors = profile.reduce((sum, tool) => sum + tool.errors, 0);
	return {
		totalToolResults,
		errors,
		errorRate: totalToolResults > 0 ? errors / totalToolResults : 0,
		byTool: profile
			.filter((tool) => tool.errors > 0)
			.map((tool) => ({ name: tool.name, total: tool.calls, errors: tool.errors, rate: tool.calls > 0 ? tool.errors / tool.calls : 0 }))
			.sort((left, right) => right.errors - left.errors),
	};
}

// K5 上下文健康：压缩频率 / 压缩量趋势（基于 compaction entry.tokensBefore），事实陈述不出分数。
export function rollupContextHealth(sessions: SessionFile[], range: TimeRange): ContextHealth {
	let compactionCount = 0;
	let totalTokensBefore = 0;
	let maxTokensBefore = 0;
	const bySessionMap = new Map<string, { file: string; name: string; count: number; tokensBefore: number }>();

	for (const session of sessions) {
		const name = sessionName(session);
		for (const entry of session.entries) {
			if (entry.type !== "compaction") continue;
			if (!inRange(entry, range)) continue;
			const tokensBefore = asNumber(entry.tokensBefore);
			compactionCount++;
			totalTokensBefore += tokensBefore;
			if (tokensBefore > maxTokensBefore) maxTokensBefore = tokensBefore;
			let per = bySessionMap.get(session.file);
			if (!per) {
				per = { file: session.file, name, count: 0, tokensBefore: 0 };
				bySessionMap.set(session.file, per);
			}
			per.count++;
			per.tokensBefore += tokensBefore;
		}
	}

	return {
		compactionCount,
		totalTokensBefore,
		maxTokensBefore,
		bySession: [...bySessionMap.values()].sort((left, right) => right.tokensBefore - left.tokensBefore),
	};
}

export function rollupDimensions(sessions: SessionFile[], range: TimeRange): Dimensions {
	return {
		projects: rollupByProject(sessions, range),
		tools: rollupToolProfile(sessions, range),
		errors: rollupErrorIntel(sessions, range),
		health: rollupContextHealth(sessions, range),
	};
}
