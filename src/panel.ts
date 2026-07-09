// L2 overlay 交互面板（Phase 6）。
// /insights 无参数时在 TUI 打开，数字视图（量纲+多维）与日报视图键盘切换（决策 7）。
// 非 TUI 模式退化为纯文本（已在 index.ts 处理）；旧 ADR 0001 的 select/input 在面板上线后失效。

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type InsightView = "numeric" | "daily";

const DAILY_PREVIEW_LINES = 12;

export interface PanelData {
	numericTitle: string;
	numericBody: string;
	dailyTitle: string;
	dailyBody: string;
	dailyPreviewHint: string;
}

export class InsightsPanel {
	private view: InsightView;
	private readonly data: PanelData;
	private readonly theme: Theme;
	private readonly done: () => void;

	constructor(data: PanelData, theme: Theme, done: () => void) {
		this.data = data;
		this.theme = theme;
		this.done = done;
		this.view = "numeric";
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.done();
			return;
		}
		if (matchesKey(data, "1")) this.view = "numeric";
		else if (matchesKey(data, "2")) this.view = "daily";
	}

	render(width: number): string[] {
		const w = Math.min(Math.max(width, 40), 110);
		const innerW = w - 2;
		const contentW = innerW - 2;
		const th = this.theme;

		const pad = (text: string, len: number): string => text + " ".repeat(Math.max(0, len - visibleWidth(text)));
		const row = (content: string): string => th.fg("border", "│") + pad(content, innerW) + th.fg("border", "│");
		const contentRow = (text: string): string => row(` ${truncateToWidth(text, contentW)}`);

		const lines: string[] = [];
		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

		// 视图切换栏
		const numericLabel = this.view === "numeric" ? th.fg("accent", "[1] 数字视图") : th.fg("dim", "[1] 数字视图");
		const dailyLabel = this.view === "daily" ? th.fg("accent", "[2] 日报视图") : th.fg("dim", "[2] 日报视图");
		lines.push(row(` ${numericLabel}   ${dailyLabel}`));
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		const title = this.view === "numeric" ? this.data.numericTitle : this.data.dailyTitle;
		lines.push(contentRow(th.fg("accent", title)));
		lines.push(row(""));

		const body = this.view === "numeric" ? this.data.numericBody : this.data.dailyBody;
		const bodyLines = body.split("\n");
		const visibleLines = this.view === "daily" && bodyLines.length > DAILY_PREVIEW_LINES
			? [...bodyLines.slice(0, DAILY_PREVIEW_LINES - 1), this.data.dailyPreviewHint]
			: bodyLines;
		for (const line of visibleLines) {
			lines.push(contentRow(line));
		}

		lines.push(row(""));
		lines.push(contentRow(th.fg("dim", "1/2 切换视图 · Esc 退出")));
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));
		return lines;
	}

	invalidate(): void {}
	dispose(): void {}
}
