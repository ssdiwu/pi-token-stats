import { complete } from "@earendil-works/pi-ai";
import type { ExtensionCommandContext, ExtensionContext } from "@earendil-works/pi-coding-agent";

import { reportLabelsFor } from "./report-labels.ts";
import { redactText, truncateText } from "./report-redact.ts";
import type { DailyReportModel, ProjectSummary, TimedText, UiLocale } from "./types.ts";

const AI_TIMEOUT_MS = 90_000;
const MAX_ITEMS_PER_SECTION = 8;

export interface AISummaryResult {
	markdown: string;
	source: "ai" | "fallback";
	model?: string;
	errors: string[];
}

interface SummarySignal {
	type: "completed" | "output" | "followUp" | "risk";
	time: string;
	text: string;
}

interface ProjectFacts {
	name: string;
	cwd: string;
	isDefaultWorkspace: boolean;
	sessionCount: number;
	entryCount: number;
	tasks: TimedText[];
	completed: TimedText[];
	outputs: TimedText[];
	risks: TimedText[];
	followUps: TimedText[];
	toolCounts: ProjectSummary["toolCounts"];
	files: string[];
}

interface SummaryFacts {
	date: string;
	generatedAt: string;
	window: string;
	stats: DailyReportModel["stats"];
	projects: ProjectFacts[];
	signals: SummarySignal[];
}

function limitItems(items: TimedText[] = [], maxItems: number, maxLength = 180): TimedText[] {
	return items.slice(0, maxItems).map((item) => ({ time: item.time || "", text: truncateText(redactText(item.text || ""), maxLength) }));
}

function buildSignals(report: DailyReportModel, maxItems: number): SummarySignal[] {
	const toSignal = (type: SummarySignal["type"], item: TimedText): SummarySignal => ({ type, time: item.time || "", text: truncateText(redactText(item.text || ""), 220) });
	return [
		...report.completed.map((item) => toSignal("completed", item)),
		...report.assistantNotes.map((item) => toSignal("output", item)),
		...report.followUps.map((item) => toSignal("followUp", item)),
		...report.errors.map((item) => toSignal("risk", item)),
		...report.blockers.map((item) => toSignal("risk", item)),
	]
		.filter((item) => item.text)
		.slice(0, Math.max(maxItems * 4, 24));
}

function buildProjectFacts(project: ProjectSummary, maxItems: number): ProjectFacts {
	return {
		name: project.projectName,
		cwd: redactText(project.cwd || ""),
		isDefaultWorkspace: project.isDefaultWorkspace,
		sessionCount: project.sessionCount,
		entryCount: project.entryCount,
		tasks: limitItems(project.tasks, maxItems, 160),
		completed: limitItems(project.completed, maxItems, 160),
		outputs: limitItems(project.outputs, maxItems, 160),
		risks: limitItems(project.risks, maxItems, 160),
		followUps: limitItems(project.followUps, maxItems, 160),
		toolCounts: project.toolCounts.slice(0, 10),
		files: project.files.slice(0, 12).map((file) => redactText(file)),
	};
}

export function buildSummaryFacts(report: DailyReportModel, maxItems = MAX_ITEMS_PER_SECTION): SummaryFacts {
	return {
		date: report.date,
		generatedAt: report.generatedAt,
		window: report.range.label,
		stats: report.stats,
		projects: report.projects.map((project) => buildProjectFacts(project, maxItems)),
		signals: buildSignals(report, maxItems),
	};
}

function languageInstructionForLocale(locale: UiLocale): string {
	switch (locale) {
		case "zh-CN":
			return "请用简体中文输出整份日报，所有标题和正文必须是简体中文。";
		case "zh-TW":
			return "請用繁體中文輸出整份日報，所有標題和正文必須是繁體中文。";
		case "en":
		default:
			return "Write the entire report in English. All headings and body content must be in English.";
	}
}

function buildSummaryPrompt(report: DailyReportModel, maxItems = MAX_ITEMS_PER_SECTION, locale: UiLocale): string {
	const facts = buildSummaryFacts(report, maxItems);
	const labels = reportLabelsFor(locale);
	const localeProjectPlaceholder = locale === "zh-TW" ? "<專案名或事項一>" : locale === "zh-CN" ? "<项目名或事项一>" : "<Project or work item 1>";
	const localeProjectPlaceholder2 = locale === "zh-TW" ? "<專案名或事項二>" : locale === "zh-CN" ? "<项目名或事项二>" : "<Project or work item 2>";
	const assistantIntro =
		locale === "zh-TW"
			? "你是日報整理助手。請基於給定的結構化工作事實，生成一份按真實專案和工作事項分組的日報總結。"
			: locale === "zh-CN"
				? "你是日报整理助手。请基于给定的结构化工作事实，生成一份按真实项目和工作事项分组的日报总结。"
				: "You are a daily report assistant. Based on the provided structured work facts, generate a daily report grouped by real projects and concrete work items.";
	const coreRequirement =
		locale === "zh-TW"
			? "核心要求：不要把完成事項 / 關鍵產出 / 阻塞 / 待跟進混成全域清單；真實專案目錄必須逐一輸出，每個真實專案都要有自己的章節。"
			: locale === "zh-CN"
				? "核心要求：不要按全局的完成事项/关键产出/阻塞/待跟进混排；真实项目目录必须逐一输出，每个真实项目都必须有自己的章节。"
				: "Core requirement: do not mix Completed / Key outputs / Blockers / Follow-ups into one global list. Every real project directory must have its own section.";
	const defaultWorkspaceRule =
		locale === "zh-TW"
			? "如果 project.isDefaultWorkspace 為 true，表示它只是預設工作區 / 使用者主目錄，不是專案；必須把其中內容拆成實際工作事項。"
			: locale === "zh-CN"
				? "如果 project.isDefaultWorkspace 为 true，说明它只是默认工作区/用户主目录，不是项目；必须把其中内容拆成实际工作事项。"
				: "If project.isDefaultWorkspace is true, it is only the default workspace or home directory, not a real project. Split its content into actual work items.";
	const noReplayRule =
		locale === "zh-TW"
			? "不要回放使用者原始提問，不要逐條複述聊天記錄。要合併同一專案 / 事項中的多輪對話，提煉成可交付結果和下一步動作。"
			: locale === "zh-CN"
				? "不要回放用户原始提问，不要逐条复述聊天记录。要合并同一项目/事项里的多轮对话，提炼成可交付结果和下一步动作。"
				: "Do not replay the user's raw prompt or summarize the chat turn by turn. Merge multiple turns for the same project or item into deliverables and next actions.";
	const factsIntro = locale === "zh-TW" ? "以下是脫敏後的結構化事實 JSON：" : locale === "zh-CN" ? "下面是脱敏后的结构化事实 JSON：" : "Below is the redacted structured facts JSON:";
	const rulesTitle = locale === "en" ? "Rules:" : "规则：";
	const emptyRule = locale === "zh-TW" ? `- 每個專案 / 事項都必須有上述 4 個三級標題；沒有內容時寫「${labels.emptyHint}」。` : locale === "zh-CN" ? `- 每个项目/事项都必须有上述 4 个三级标题；没有内容时写“${labels.emptyHint}”。` : `- Every project or item must contain the 4 level-3 headings above; if a section has no content, write "${labels.emptyHint}".`;
	const realProjectRule = locale === "zh-TW" ? "- 對真實專案目錄，專案名直接使用 cwd 對應的專案名或目錄名。" : locale === "zh-CN" ? "- 对真实项目目录，项目名直接使用 cwd 对应项目名或目录名。" : "- For a real project directory, use the project name or directory name from cwd directly as the section title.";
	const isolateProjectsRule = locale === "zh-TW" ? "- 不要讓某個專案或事項的內容覆蓋另一個專案；每個真實專案都要單獨總結。" : locale === "zh-CN" ? "- 不要让某个项目或事项的内容覆盖另一个项目；每个真实项目都要单独总结。" : "- Do not let the content of one project or item cover another; every real project must be summarized separately.";
	const crossProjectRule = locale === "zh-TW" ? "- 跨專案觀察只寫共通問題、共通進展或共通風險。" : locale === "zh-CN" ? "- 跨项目观察只写共性问题、共性进展或共性风险。" : "- Cross-project observations should only contain shared issues, shared progress, or shared risks.";
	const filesAndToolsRule = locale === "zh-TW" ? "- 檔案與工具活動只做簡短歸納，不要列出大量偽路徑或內部欄位。" : locale === "zh-CN" ? "- 工具与文件活动只做简短归纳，不要列出大量伪路径或内部字段。" : "- Files & tools should be summarized briefly; do not dump long pseudo-path or internal-field lists.";
	const sectionRequirement = locale === "zh-TW" ? `每個專案或事項章節至少包含：${labels.progress}、${labels.outputs}、${labels.risks}、${labels.followUps}。` : locale === "zh-CN" ? `每个项目或事项章节至少包含：${labels.progress}、${labels.outputs}、${labels.risks}、${labels.followUps}。` : `Each project or work-item section must include at least ${labels.progress}, ${labels.outputs}, ${labels.risks}, and ${labels.followUps}.`;
	const titleMetaInstruction = locale === "zh-TW" ? `在標題下方依序寫：${labels.generatedAt}（必須使用 facts.generatedAt）、${labels.window}（必須使用 facts.window）。` : locale === "zh-CN" ? `在标题下方依次写：${labels.generatedAt}（必须使用 facts.generatedAt）、${labels.window}（必须使用 facts.window）。` : `Under the title, write ${labels.generatedAt} and ${labels.window} in that order (${labels.generatedAt} must use facts.generatedAt and the time window must use facts.window).`;
	const overviewInstruction = locale === "zh-TW" ? "用 3-5 條 bullet 概括今天完成了哪些類型的工作。" : locale === "zh-CN" ? "用 3-5 条 bullet 概括今天做了哪几类事情。" : "Use 3-5 bullets to summarize the main categories of work completed today.";
	return [
		assistantIntro,
		languageInstructionForLocale(locale),
		coreRequirement,
		defaultWorkspaceRule,
		sectionRequirement,
		noReplayRule,
		locale === "en" ? "Output strict Markdown and use the following localized structure and headings:" : "严格输出 Markdown，并使用以下结构和本地化标题：",
		`# ${labels.reportTitle(report.date)}`,
		titleMetaInstruction,
		`## ${labels.overview}`,
		overviewInstruction,
		`## ${localeProjectPlaceholder}`,
		`### ${labels.progress}`,
		`### ${labels.outputs}`,
		`### ${labels.risks}`,
		`### ${labels.followUps}`,
		`## ${localeProjectPlaceholder2}`,
		`### ${labels.progress}`,
		`### ${labels.outputs}`,
		`### ${labels.risks}`,
		`### ${labels.followUps}`,
		`## ${labels.completed} / ${labels.keyOutputs} / ${labels.crossProjectObservations} / ${labels.filesAndTools}`,
		rulesTitle,
		emptyRule,
		realProjectRule,
		isolateProjectsRule,
		crossProjectRule,
		filesAndToolsRule,
		factsIntro,
		JSON.stringify(facts, null, 2),
	].join("\n\n");
}

async function callCurrentModel(model: any, promptText: string, ctx: ExtensionCommandContext | ExtensionContext): Promise<string> {
	if (!model) throw new Error("current session model is not available");
	const auth = await ctx.modelRegistry.getApiKeyAndHeaders(model);
	if (!auth?.ok) throw new Error(`auth not ok: ${auth?.error || "unknown"}`);
	if (!auth.apiKey) throw new Error("auth missing apiKey");

	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(new Error("pi-session-insights AI summary timed out")), AI_TIMEOUT_MS);
	try {
		const response: any = await complete(
			model,
			{ messages: [{ role: "user", content: [{ type: "text", text: promptText }], timestamp: Date.now() }] },
			{ apiKey: auth.apiKey, headers: auth.headers, maxTokens: 1800, signal: controller.signal },
		);
		if (response.errorMessage) throw new Error(response.errorMessage);
		return response.content.filter((item: any) => item.type === "text").map((item: any) => item.text).join("\n").trim();
	} finally {
		clearTimeout(timeoutId);
	}
}

export async function summarizeReportWithAI(report: DailyReportModel, ctx: ExtensionCommandContext | ExtensionContext, locale: UiLocale): Promise<AISummaryResult> {
	const prompt = buildSummaryPrompt(report, MAX_ITEMS_PER_SECTION, locale);
	const model = ctx.model ?? ctx.modelRegistry.getAvailable()[0];
	const modelId = model ? `${String((model as any).provider ?? "unknown")}/${String((model as any).id ?? (model as any).name ?? "unknown")}` : "";
	try {
		const markdown = await callCurrentModel(model, prompt, ctx);
		if (markdown) return { markdown, source: "ai", model: modelId, errors: [] };
		return { markdown: "", source: "fallback", errors: [`${modelId || "current model"}: empty response`] };
	} catch (error) {
		return { markdown: "", source: "fallback", errors: [`${modelId || "current model"}: ${error instanceof Error ? error.message : String(error)}`] };
	}
}
