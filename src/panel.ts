// L2 overlay 交互面板（Phase 6）。
// /insights 无参数时立即挂载，异步加载数字视图与日报预览；1/2 切换、Esc 退出。
// 非 TUI 模式退化为纯文本（已在 index.ts 处理）。

import type { Theme } from "@earendil-works/pi-coding-agent";
import { matchesKey, truncateToWidth, visibleWidth } from "@earendil-works/pi-tui";

export type InsightView = "numeric" | "daily";

const DAILY_PREVIEW_LINES = 12;

interface RenderRequester {
	requestRender(): void;
}

export interface PanelData {
	numericTitle: string;
	numericBody: string;
	dailyTitle: string;
	dailyBody: string;
	dailyPreviewHint: string;
}

export interface InsightsPanelOptions {
	load: () => Promise<PanelData>;
	loadingTitle: string;
	loadingBody: string;
	errorTitle: string;
	errorBody: (message: string) => string;
}

export class InsightsPanel {
	private view: InsightView = "numeric";
	private data: PanelData | null = null;
	private loading = true;
	private error: string | null = null;
	private disposed = false;

	constructor(
		private readonly options: InsightsPanelOptions,
		private readonly tui: RenderRequester,
		private readonly theme: Theme,
		private readonly done: () => void,
	) {
		void this.load();
	}

	private async load(): Promise<void> {
		this.loading = true;
		this.error = null;
		this.tui.requestRender();
		try {
			const data = await this.options.load();
			if (this.disposed) return;
			this.data = data;
		} catch (error) {
			if (this.disposed) return;
			this.error = error instanceof Error ? error.message : String(error);
		} finally {
			if (!this.disposed) {
				this.loading = false;
				this.tui.requestRender();
			}
		}
	}

	handleInput(data: string): void {
		if (matchesKey(data, "escape")) {
			this.dispose();
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
		const bodyRows = (body: string): string[] => body.split("\n").map(contentRow);

		const lines: string[] = [];
		lines.push(th.fg("border", `╭${"─".repeat(innerW)}╮`));

		const numericLabel = this.view === "numeric" ? th.fg("accent", "[1] 数字视图") : th.fg("dim", "[1] 数字视图");
		const dailyLabel = this.view === "daily" ? th.fg("accent", "[2] 日报视图") : th.fg("dim", "[2] 日报视图");
		lines.push(row(` ${numericLabel}   ${dailyLabel}`));
		lines.push(th.fg("border", `├${"─".repeat(innerW)}┤`));

		if (this.loading) {
			lines.push(contentRow(th.fg("accent", this.options.loadingTitle)));
			lines.push(row(""));
			lines.push(...bodyRows(th.fg("dim", this.options.loadingBody)));
		} else if (this.error) {
			lines.push(contentRow(th.fg("accent", this.options.errorTitle)));
			lines.push(row(""));
			lines.push(...bodyRows(th.fg("warning", this.options.errorBody(this.error))));
		} else if (this.data) {
			const title = this.view === "numeric" ? this.data.numericTitle : this.data.dailyTitle;
			const body = this.view === "numeric" ? this.data.numericBody : this.data.dailyBody;
			const bodyLines = body.split("\n");
			const visibleLines = this.view === "daily" && bodyLines.length > DAILY_PREVIEW_LINES
				? [...bodyLines.slice(0, DAILY_PREVIEW_LINES - 1), this.data.dailyPreviewHint]
				: bodyLines;
			lines.push(contentRow(th.fg("accent", title)));
			lines.push(row(""));
			for (const line of visibleLines) lines.push(contentRow(line));
		}

		lines.push(row(""));
		lines.push(contentRow(th.fg("dim", "1/2 切换视图 · Esc 退出")));
		lines.push(th.fg("border", `╰${"─".repeat(innerW)}╯`));
		return lines;
	}

	invalidate(): void {}

	dispose(): void {
		this.disposed = true;
	}
}
