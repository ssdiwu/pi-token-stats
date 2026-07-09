import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

const THINKING_LEVELS = new Set(["off", "minimal", "low", "medium", "high", "xhigh"]);

export interface DailyConfigInput {
	reportOutputDir?: string;
	dailyModel?: string;
}

export interface DailyConfig {
	outputDir: string;
	dailyModel?: string;
}

export interface DailyModelSelector {
	provider: string;
	modelId: string;
	thinking?: string;
}

export interface IdentifiedModel {
	provider?: string;
	id?: string;
}

export interface DailyModelSelection<T extends IdentifiedModel> {
	model?: T;
	thinking?: string;
	source: "configured" | "current" | "current-fallback" | "unavailable";
	notice?: string;
}

export function getDailyConfigPath(homeDir = os.homedir()): string {
	return path.join(homeDir, ".pi", "agent", "pi-session-insights.json");
}

export async function readDailyConfig(homeDir = os.homedir()): Promise<DailyConfig> {
	try {
		const value = JSON.parse(await fs.readFile(getDailyConfigPath(homeDir), "utf8")) as DailyConfigInput;
		return resolveDailyConfig(value, homeDir);
	} catch {
		return resolveDailyConfig({}, homeDir);
	}
}

export function resolveDailyConfig(input: DailyConfigInput = {}, homeDir: string): DailyConfig {
	const outputDir = input.reportOutputDir?.trim() || path.join(homeDir, "Documents", "pi-daily-reports");
	const dailyModel = input.dailyModel?.trim() || undefined;
	return { outputDir, dailyModel };
}

export function parseDailyModelSelector(value: string): DailyModelSelector | undefined {
	const trimmed = value.trim();
	const slash = trimmed.indexOf("/");
	if (slash <= 0 || slash === trimmed.length - 1) return undefined;

	const provider = trimmed.slice(0, slash);
	const modelAndThinking = trimmed.slice(slash + 1);
	const separator = modelAndThinking.lastIndexOf(":");
	const candidateThinking = separator >= 0 ? modelAndThinking.slice(separator + 1) : "";
	const thinking = THINKING_LEVELS.has(candidateThinking) ? candidateThinking : undefined;
	const modelId = thinking ? modelAndThinking.slice(0, separator) : modelAndThinking;
	if (!modelId) return undefined;
	return { provider, modelId, thinking };
}

function describeSelector(selector: DailyModelSelector): string {
	return `${selector.provider}/${selector.modelId}${selector.thinking ? `:${selector.thinking}` : ""}`;
}

export function selectDailyModel<T extends IdentifiedModel>(available: T[], current: T | undefined, selectorText: string | undefined): DailyModelSelection<T> {
	if (!selectorText) return current ? { model: current, source: "current" } : { source: "unavailable" };

	const selector = parseDailyModelSelector(selectorText);
	if (!selector) {
		return current
			? { model: current, source: "current-fallback", notice: `Configured daily model is invalid: ${selectorText}; using the current session model.` }
			: { source: "unavailable", notice: `Configured daily model is invalid: ${selectorText}.` };
	}

	const configured = available.find((model) => model.provider === selector.provider && model.id === selector.modelId);
	if (configured) return { model: configured, thinking: selector.thinking, source: "configured" };

	return current
		? { model: current, source: "current-fallback", notice: `Configured daily model ${describeSelector(selector)} is unavailable; using the current session model.` }
		: { source: "unavailable", notice: `Configured daily model ${describeSelector(selector)} is unavailable and no current session model is available.` };
}
