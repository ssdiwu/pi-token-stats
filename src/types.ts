// 基础类型层：Session JSONL 解析类型 + 量纲聚合类型 + 时间范围类型。
// Session 基础类型复用自 pi-daily 的 types.ts（只读扫描会话日志）。

export interface ScanError {
	file?: string;
	line: number;
	error: string;
}

export interface SessionHeader {
	id?: string;
	cwd?: string;
	[key: string]: unknown;
}

export interface SessionMessage {
	role?: string;
	content?: unknown;
	timestamp?: string | number | Date | null;
	toolName?: string;
	isError?: boolean;
	command?: string;
	exitCode?: number;
	provider?: string;
	model?: string;
	usage?: unknown;
	toolCallId?: string;
}

export interface SessionEntry {
	type?: string;
	timestamp?: string | number | Date | null;
	message?: SessionMessage;
	name?: string;
	cwd?: string;
	provider?: string;
	modelId?: string;
	customType?: string;
	tokensBefore?: number;
}

export interface ParsedSession {
	file?: string;
	header: SessionHeader | null;
	entries: SessionEntry[];
	errors?: ScanError[];
}

export interface SessionFile extends ParsedSession {
	file: string;
}

export interface ScanSessionsOptions {
	sessionRoot?: string;
	files?: string[];
	modifiedSince?: number;
}

export interface ScanSessionsResult {
	sessionRoot: string;
	files: string[];
	sessions: SessionFile[];
	errors: ScanError[];
}

// K0 量纲聚合类型（迁移自 token-stats）

export interface TokenStats {
	userMessages: number;
	assistantMessages: number;
	toolCalls: number;
	toolResults: number;
	inputTokens: number;
	outputTokens: number;
	cacheReadTokens: number;
	cacheWriteTokens: number;
	totalTokens: number;
	totalCost: number;
}

export interface ModelRollup {
	provider: string;
	model: string;
	stats: TokenStats;
}

export interface SessionRollup {
	file: string;
	name: string;
	cwd?: string;
	stats: TokenStats;
	models: ModelRollup[];
}

export interface Report {
	title: string;
	body: string;
	stats: TokenStats;
	sessions: SessionRollup[];
	models: ModelRollup[];
	dimensions?: Dimensions;
}

// 多维聚合类型（K1 项目 / K2 工具 / K3 错误 / K5 健康）

export interface ProjectRollup {
	cwd: string;
	name: string;
	sessionCount: number;
	stats: TokenStats;
}

export interface ToolProfile {
	name: string;
	calls: number;
	errors: number;
}

export interface ToolErrorStat {
	name: string;
	total: number;
	errors: number;
	rate: number;
}

export interface ErrorIntel {
	totalToolResults: number;
	errors: number;
	errorRate: number;
	byTool: ToolErrorStat[];
}

export interface SessionCompaction {
	file: string;
	name: string;
	count: number;
	tokensBefore: number;
}

export interface ContextHealth {
	compactionCount: number;
	totalTokensBefore: number;
	maxTokensBefore: number;
	bySession: SessionCompaction[];
}

export interface Dimensions {
	projects: ProjectRollup[];
	tools: ToolProfile[];
	errors: ErrorIntel;
	health: ContextHealth;
}

// 按天摘要缓存（跨天聚合读天摘要，不碰会话原文）

export interface DaySummary {
	date: string; // YYYY-MM-DD
	since: number;
	until: number;
	stats: TokenStats;
	sessionCount: number;
	models: ModelRollup[];
	dimensions: Dimensions;
	narrative?: string;
	narrativeSource?: "ai" | "fallback" | "none";
	reportMarkdown?: string;
	reportSource?: "ai" | "fallback" | "none";
	reportLocale?: UiLocale;
	generatedAt: string;
}

export interface TimeRange {
	label: string;
	since: number;
	until: number;
}

export interface ToolActivity {
	time: string;
	toolName: string;
	arguments?: Record<string, unknown>;
	result?: string;
	isError?: boolean;
}

export interface TimedText {
	time: string;
	text: string;
}

export interface SessionActivity {
	targetDate: string;
	range: TimeRange;
	sessionId: string;
	file?: string;
	cwd: string;
	projectName: string;
	activeEntryCount: number;
	firstActiveTime: string;
	lastActiveTime: string;
	taskNotes: TimedText[];
	pendingNotes: TimedText[];
	completedNotes: TimedText[];
	assistantNotes: TimedText[];
	toolCalls: ToolActivity[];
	filePaths: string[];
	errors: TimedText[];
	blockers: TimedText[];
}

export interface MutableSessionActivity extends Omit<SessionActivity, "firstActiveTime" | "lastActiveTime" | "filePaths"> {
	activeTimes: string[];
	filePaths: Set<string>;
}

export interface ToolCount {
	name: string;
	count: number;
}

export interface ProjectSummary {
	cwd: string;
	projectName: string;
	isDefaultWorkspace: boolean;
	sessionCount: number;
	entryCount: number;
	files: string[];
	tasks: TimedText[];
	completed: TimedText[];
	outputs: TimedText[];
	risks: TimedText[];
	followUps: TimedText[];
	toolCounts: ToolCount[];
}

export interface DailyReportStats {
	sessionCount: number;
	projectCount: number;
	entryCount: number;
	fileCount: number;
	scanErrorCount: number;
}

export interface DailyReportModel {
	date: string;
	range: TimeRange;
	generatedAt: string;
	stats: DailyReportStats;
	projects: ProjectSummary[];
	tasks: TimedText[];
	completed: TimedText[];
	assistantNotes: TimedText[];
	files: string[];
	toolCounts: ToolCount[];
	errors: TimedText[];
	blockers: TimedText[];
	followUps: TimedText[];
	scanErrors: ScanError[];
}

export interface RangeRequest {
	range?: string;
	since?: string;
	until?: string;
	label?: string;
}

export interface RangeBoundary {
	label: string;
	timestamp: number;
}

export interface LlmRangeResolution {
	kind: "range" | "session" | "unparsed";
	since?: string;
	until?: string;
	label?: string;
}

export type UiLocale = "en" | "zh-CN" | "zh-TW";

export type I18nApiLike = {
	getLocale?: () => string;
};
