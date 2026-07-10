// K0 量纲聚合层（迁移自 token-stats，改为纯函数 + typed）。
// 不读文件（文件由 session-scan 异步读好），只做内存聚合，便于单元测试。
// 按 assistant message 的时间戳归属 token/cost，按 provider/model 分组。

import type { ModelRollup, SessionEntry, SessionFile, SessionRollup, TimeRange, TokenStats } from "./types.ts";

export function asNumber(value: unknown): number {
	return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function countToolCalls(content: unknown): number {
	if (!Array.isArray(content)) return 0;
	return content.filter((block) => block && typeof block === "object" && (block as { type?: string }).type === "toolCall").length;
}

export function entryTimestamp(entry: SessionEntry): number {
	const messageTimestamp = entry?.message?.timestamp;
	if (typeof messageTimestamp === "number" && Number.isFinite(messageTimestamp) && messageTimestamp > 0) return messageTimestamp;
	if (messageTimestamp) {
		const parsedMessageTimestamp = new Date(messageTimestamp).getTime();
		if (Number.isFinite(parsedMessageTimestamp)) return parsedMessageTimestamp;
	}

	const outerTimestamp = entry?.timestamp;
	if (typeof outerTimestamp === "number" && Number.isFinite(outerTimestamp) && outerTimestamp > 0) return outerTimestamp;
	const timestamp = Date.parse((outerTimestamp as string) ?? "");
	return Number.isFinite(timestamp) ? timestamp : 0;
}

export function emptyStats(): TokenStats {
	return {
		userMessages: 0,
		assistantMessages: 0,
		toolCalls: 0,
		toolResults: 0,
		inputTokens: 0,
		outputTokens: 0,
		cacheReadTokens: 0,
		cacheWriteTokens: 0,
		totalTokens: 0,
		totalCost: 0,
	};
}

export function addStats(target: TokenStats, source: TokenStats): void {
	target.userMessages += source.userMessages;
	target.assistantMessages += source.assistantMessages;
	target.toolCalls += source.toolCalls;
	target.toolResults += source.toolResults;
	target.inputTokens += source.inputTokens;
	target.outputTokens += source.outputTokens;
	target.cacheReadTokens += source.cacheReadTokens;
	target.cacheWriteTokens += source.cacheWriteTokens;
	target.totalTokens += source.totalTokens;
	target.totalCost += source.totalCost;
}

function addUsage(stats: TokenStats, usage: unknown): void {
	if (!usage || typeof usage !== "object") return;
	const u = usage as Record<string, unknown>;

	const input = asNumber(u.input);
	const output = asNumber(u.output);
	const cacheRead = asNumber(u.cacheRead);
	const cacheWrite = asNumber(u.cacheWrite);
	const total = asNumber(u.totalTokens) || input + output + cacheRead + cacheWrite;
	const cost = asNumber((u.cost as Record<string, unknown> | undefined)?.total);

	stats.inputTokens += input;
	stats.outputTokens += output;
	stats.cacheReadTokens += cacheRead;
	stats.cacheWriteTokens += cacheWrite;
	stats.totalTokens += total;
	stats.totalCost += cost;
}

function addModelStats(models: Map<string, ModelRollup>, message: SessionEntry["message"]): void {
	if (!message) return;
	const provider = typeof message.provider === "string" && message.provider ? message.provider : "unknown-provider";
	const model = typeof message.model === "string" && message.model ? message.model : "unknown-model";
	const key = `${provider}/${model}`;
	let rollup = models.get(key);
	if (!rollup) {
		rollup = { provider, model, stats: emptyStats() };
		models.set(key, rollup);
	}
	rollup.stats.assistantMessages++;
	rollup.stats.toolCalls += countToolCalls(message.content);
	addUsage(rollup.stats, message.usage);
}

function mergeModelRollups(target: Map<string, ModelRollup>, models: ModelRollup[]): void {
	for (const source of models) {
		const key = `${source.provider}/${source.model}`;
		let rollup = target.get(key);
		if (!rollup) {
			rollup = { provider: source.provider, model: source.model, stats: emptyStats() };
			target.set(key, rollup);
		}
		addStats(rollup.stats, source.stats);
	}
}

function sortedModels(models: Map<string, ModelRollup>): ModelRollup[] {
	return [...models.values()].sort((left, right) => right.stats.totalTokens - left.stats.totalTokens);
}

function addMessageEntry(stats: TokenStats, entry: SessionEntry, models?: Map<string, ModelRollup>): void {
	if (entry?.type !== "message") return;

	const message = entry.message;
	if (!message) return;

	if (message.role === "user") {
		stats.userMessages++;
		return;
	}

	if (message.role === "assistant") {
		stats.assistantMessages++;
		stats.toolCalls += countToolCalls(message.content);
		addUsage(stats, message.usage);
		if (models) addModelStats(models, message);
		return;
	}

	if (message.role === "toolResult") stats.toolResults++;
}

export function rollupEntries(entries: SessionEntry[], range?: TimeRange): { stats: TokenStats; models: ModelRollup[] } {
	const stats = emptyStats();
	const models = new Map<string, ModelRollup>();
	for (const entry of entries) {
		const timestamp = entryTimestamp(entry);
		if (!range || (timestamp >= range.since && timestamp < range.until)) addMessageEntry(stats, entry, models);
	}
	return { stats, models: sortedModels(models) };
}

export function messageTotal(stats: TokenStats): number {
	return stats.userMessages + stats.assistantMessages + stats.toolResults;
}

export function rollupSessionFile(session: SessionFile, range: TimeRange): SessionRollup | undefined {
	const entries = session.entries;
	if (entries.length === 0) return undefined;

	const nameEntry = entries.filter((entry) => entry?.type === "session_info" && typeof entry.name === "string").pop();
	const { stats, models } = rollupEntries(entries, range);

	if (messageTotal(stats) === 0 && stats.totalTokens === 0) return undefined;

	return {
		file: session.file,
		name: nameEntry?.name ?? session.file,
		cwd: session.header?.cwd,
		stats,
		models,
	};
}

export interface UsageRollupResult {
	stats: TokenStats;
	models: ModelRollup[];
	sessions: SessionRollup[];
}

export function rollupSessions(sessions: SessionFile[], range: TimeRange): UsageRollupResult {
	const stats = emptyStats();
	const modelMap = new Map<string, ModelRollup>();
	const sessionRollups: SessionRollup[] = [];

	for (const session of sessions) {
		const rollup = rollupSessionFile(session, range);
		if (!rollup) continue;
		sessionRollups.push(rollup);
		addStats(stats, rollup.stats);
		mergeModelRollups(modelMap, rollup.models);
	}

	return { stats, models: sortedModels(modelMap), sessions: sessionRollups };
}
