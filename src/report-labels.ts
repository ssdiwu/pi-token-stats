import type { UiLocale } from "./types.ts";

export interface ReportLabels {
	reportTitle: (date: string) => string;
	generatedAt: string;
	window: string;
	sep: string;
	overview: string;
	activeProjects: string;
	completed: string;
	keyOutputs: string;
	filesAndTools: string;
	progress: string;
	outputs: string;
	risks: string;
	followUps: string;
	crossProjectObservations: string;
	scanWarnings: string;
	emptyHint: string;
	stats: {
		projects: (n: number) => string;
		sessions: (n: number) => string;
		entries: (n: number) => string;
		files: (n: number) => string;
		scanWarnings: (n: number) => string;
	};
	projectLine: (name: string, cwd: string, sessions: number, entries: number) => string;
	moreFiles: (n: number) => string;
	toolCount: (name: string, count: number) => string;
}

const L: Record<UiLocale, Omit<ReportLabels, "stats" | "projectLine" | "moreFiles" | "toolCount">> = {
	"zh-CN": {
		reportTitle: (d) => `${d} 工作日报`,
		generatedAt: "生成时间",
		sep: "：",
		window: "统计范围",
		overview: "今日概览",
		activeProjects: "活跃项目",
		completed: "完成事项",
		keyOutputs: "关键产出",
		filesAndTools: "文件与工具活动",
		progress: "进展",
		outputs: "产出",
		risks: "阻塞 / 风险",
		followUps: "待跟进",
		crossProjectObservations: "跨项目观察",
		scanWarnings: "解析警告",
		emptyHint: "暂无记录",
	},
	"zh-TW": {
		reportTitle: (d) => `${d} 工作日報`,
		generatedAt: "產生時間",
		sep: "：",
		window: "統計範圍",
		overview: "今日概覽",
		activeProjects: "活躍項目",
		completed: "完成事項",
		keyOutputs: "關鍵產出",
		filesAndTools: "檔案與工具活動",
		progress: "進展",
		outputs: "產出",
		risks: "阻塞 / 風險",
		followUps: "待跟進",
		crossProjectObservations: "跨專案觀察",
		scanWarnings: "解析警告",
		emptyHint: "暫無記錄",
	},
	en: {
		reportTitle: (d) => `Work report for ${d}`,
		generatedAt: "Generated at",
		sep: ": ",
		window: "Window",
		overview: "Overview",
		activeProjects: "Active projects",
		completed: "Completed",
		keyOutputs: "Key outputs",
		filesAndTools: "Files & tools",
		progress: "Progress",
		outputs: "Outputs",
		risks: "Blockers / Risks",
		followUps: "Follow-ups",
		crossProjectObservations: "Cross-project observations",
		scanWarnings: "Parse warnings",
		emptyHint: "No records",
	},
};

function statsFor(locale: UiLocale): ReportLabels["stats"] {
	switch (locale) {
		case "zh-CN":
			return {
				projects: (n) => `活跃项目：${n} 个`,
				sessions: (n) => `活跃会话：${n} 个`,
				entries: (n) => `活动条目：${n} 条`,
				files: (n) => `涉及文件：${n} 个`,
				scanWarnings: (n) => `解析警告：${n} 条`,
			};
		case "zh-TW":
			return {
				projects: (n) => `活躍項目：${n} 個`,
				sessions: (n) => `活躍工作階段：${n} 個`,
				entries: (n) => `活動條目：${n} 條`,
				files: (n) => `涉及檔案：${n} 個`,
				scanWarnings: (n) => `解析警告：${n} 條`,
			};
		default:
			return {
				projects: (n) => `Active projects: ${n}`,
				sessions: (n) => `Active sessions: ${n}`,
				entries: (n) => `Activity entries: ${n}`,
				files: (n) => `Files touched: ${n}`,
				scanWarnings: (n) => `Parse warnings: ${n}`,
			};
	}
}

export function reportLabelsFor(locale: UiLocale): ReportLabels {
	const base = L[locale] ?? L.en;
	const stats = statsFor(locale);
	const projectLine: ReportLabels["projectLine"] =
		locale === "zh-CN"
			? (name, cwd, sessions, entries) => {
					const cwdPart = cwd ? `（${cwd}）` : "";
					return `${name}${cwdPart}：${sessions} 个 session，${entries} 条活动`;
				}
			: locale === "zh-TW"
				? (name, cwd, sessions, entries) => {
						const cwdPart = cwd ? `（${cwd}）` : "";
						return `${name}${cwdPart}：${sessions} 個 session，${entries} 條活動`;
					}
				: (name, cwd, sessions, entries) => {
						const cwdPart = cwd ? ` (${cwd})` : "";
						return `${name}${cwdPart}: ${sessions} sessions, ${entries} entries`;
					};
	const moreFiles: ReportLabels["moreFiles"] =
		locale === "zh-CN"
			? (n) => `另有 ${n} 个文件未展示`
			: locale === "zh-TW"
				? (n) => `另有 ${n} 個檔案未展示`
				: (n) => `${n} more files not shown`;
	const toolCount: ReportLabels["toolCount"] =
		locale === "zh-CN" || locale === "zh-TW"
			? (name, count) => `${name}：${count} 次`
			: (name, count) => `${name}: ${count} times`;
	return { ...base, stats, projectLine, moreFiles, toolCount };
}
