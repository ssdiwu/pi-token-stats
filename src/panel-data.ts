// L2 overlay 面板数据加载：把 index.ts 中的面板数据构造抽出来，让入口文件只负责注册。

import { getLocalDateString } from "./date-utils.ts";
import { readDaySummary } from "./day-cache.ts";
import { t } from "./locale.ts";
import { reportLabelsFor } from "./report-labels.ts";
import { scanSessions } from "./session-scan.ts";
import { buildTodayReportFromSessions } from "./insights.ts";
import type { UiLocale } from "./types.ts";

export interface PanelDataPayload {
	numericTitle: string;
	numericBody: string;
	dailyTitle: string;
	dailyBody: string;
	dailyPreviewHint: string;
}

export async function loadInsightsPanelData(locale: UiLocale, now: Date): Promise<PanelDataPayload> {
	const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
	const yesterdayDate = new Date(now);
	yesterdayDate.setDate(yesterdayDate.getDate() - 1);
	const yesterday = getLocalDateString(yesterdayDate);
	const [{ sessions }, cachedDaily] = await Promise.all([
		scanSessions({ modifiedSince: todayStart }),
		readDaySummary(yesterday),
	]);

	const numeric = buildTodayReportFromSessions(sessions, locale, now);
	return {
		numericTitle: numeric.title,
		numericBody: numeric.body,
		dailyTitle: reportLabelsFor(locale).reportTitle(yesterday),
		dailyBody: cachedDaily?.reportMarkdown || t(locale, "dailyPreviewUnavailable"),
		dailyPreviewHint: t(locale, "dailyPreviewHint"),
	};
}
