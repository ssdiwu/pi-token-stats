// 日报命令层的 UI 文案字典（覆盖确认、批量标题、归档提示、跳过提示、失败提示等）。
// 与日报正文内部的 report-labels.ts 分离，避免单一字典职责膨胀。
//
// 覆盖确认策略（ADR：独立 daily 入口与归档覆盖策略）：
//   - 无已有文件：直接写入，不确认。
//   - 有已有文件 + 有 UI：一次确认是否覆盖（列出新建/覆盖日期）。
//   - 有已有文件 + 无 UI（print/json/rpc）：默认跳过覆盖项，只写新建项并在结果提示。

import type { UiLocale } from "./types.ts";

export interface DailyBatchLabels {
	overwriteTitle: string;
	overwriteBody: (newDates: string[], existingDates: string[]) => string;
	title: string;
	generated: (count: number) => string;
	archived: (path: string) => string;
	failed: string;
	skippedNotice: (dates: string[]) => string;
}

export interface DailyUiLabels {
	dailyBatch: DailyBatchLabels;
}

function joinZh(dates: string[]): string {
	return dates.join("、");
}

function joinLatin(dates: string[]): string {
	return dates.join(", ");
}

function overwriteBodyZh(newDates: string[], existingDates: string[], newWord: string, overwriteWord: string): string {
	const parts: string[] = [];
	if (newDates.length > 0) parts.push(`${newWord} ${newDates.length} ${joinZh(newDates)}`);
	parts.push(`${overwriteWord} ${existingDates.length} ${joinZh(existingDates)}`);
	return parts.join("\n");
}

const L: Record<UiLocale, DailyUiLabels> = {
	"zh-CN": {
		dailyBatch: {
			overwriteTitle: "确认覆盖已有日报？",
			overwriteBody: (newDates, existingDates) => overwriteBodyZh(newDates, existingDates, "新建", "覆盖已有"),
			title: "多天会话日报",
			generated: (count: number) => `已生成并归档 ${count} 篇日报：`,
			archived: (path: string) => `已归档：${path}`,
			failed: "日报生成失败：",
			skippedNotice: (dates) => `已跳过 ${dates.length} 篇已有日报（未覆盖）：${joinZh(dates)}`,
		},
	},
	"zh-TW": {
		dailyBatch: {
			overwriteTitle: "確認覆蓋已有日報？",
			overwriteBody: (newDates, existingDates) => overwriteBodyZh(newDates, existingDates, "新增", "覆蓋已有"),
			title: "多天會話日報",
			generated: (count: number) => `已產生並歸檔 ${count} 篇日報：`,
			archived: (path: string) => `已歸檔：${path}`,
			failed: "日報生成失敗：",
			skippedNotice: (dates) => `已跳過 ${dates.length} 篇已有日報（未覆蓋）：${joinZh(dates)}`,
		},
	},
	en: {
		dailyBatch: {
			overwriteTitle: "Overwrite existing reports?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`New (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`Overwrite (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Multi-day session reports",
			generated: (count: number) => `Generated and archived ${count} daily report(s):`,
			archived: (path: string) => `Archived: ${path}`,
			failed: "Daily report generation failed:",
			skippedNotice: (dates) => `Skipped ${dates.length} existing report(s) (not overwritten): ${joinLatin(dates)}`,
		},
	},
	ja: {
		dailyBatch: {
			overwriteTitle: "既存の日報を上書きしますか？",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`新規（${newDates.length}）：${joinZh(newDates)}`);
				parts.push(`上書き（${existingDates.length}）：${joinZh(existingDates)}`);
				return parts.join("\n");
			},
			title: "複数日のセッションレポート",
			generated: (count: number) => `生成して保存した日報 ${count} 件：`,
			archived: (path: string) => `保存済み：${path}`,
			failed: "日報の生成に失敗しました：",
			skippedNotice: (dates) => `${dates.length} 件の既存日報をスキップしました（上書きなし）：${joinZh(dates)}`,
		},
	},
	ko: {
		dailyBatch: {
			overwriteTitle: "기존 보고서를 덮어쓰시겠습니까?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`신규 (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`덮어쓰기 (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "여러 날의 세션 보고서",
			generated: (count: number) => `생성 및 보관된 일일 보고서 ${count}개:`,
			archived: (path: string) => `보관됨: ${path}`,
			failed: "일일 보고서 생성 실패:",
			skippedNotice: (dates) => `기존 보고서 ${dates.length}개 건너뜀 (덮어쓰지 않음): ${joinLatin(dates)}`,
		},
	},
	de: {
		dailyBatch: {
			overwriteTitle: "Vorhandene Berichte überschreiben?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`Neu (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`Überschreiben (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Mehrere Sitzungsberichte",
			generated: (count: number) => `Erstellte und archivierte Tagesberichte (${count}):`,
			archived: (path: string) => `Archiviert: ${path}`,
			failed: "Tagesbericht konnte nicht erstellt werden:",
			skippedNotice: (dates) => `${dates.length} vorhandene(r) Bericht(e) übersprungen (nicht überschrieben): ${joinLatin(dates)}`,
		},
	},
	fr: {
		dailyBatch: {
			overwriteTitle: "Remplacer les rapports existants ?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`Nouveaux (${newDates.length}) : ${joinLatin(newDates)}`);
				parts.push(`Remplacer (${existingDates.length}) : ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Rapports de session sur plusieurs jours",
			generated: (count: number) => `Rapport(s) quotidien(s) généré(s) et archivé(s) (${count}) :`,
			archived: (path: string) => `Archivé : ${path}`,
			failed: "Échec de la génération du rapport quotidien :",
			skippedNotice: (dates) => `${dates.length} rapport(s) existant(s) ignoré(s) (non remplacé(s)) : ${joinLatin(dates)}`,
		},
	},
	es: {
		dailyBatch: {
			overwriteTitle: "¿Sobrescribir los informes existentes?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`Nuevos (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`Sobrescribir (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Informes de sesión de varios días",
			generated: (count: number) => `Informes diarios generados y archivados (${count}):`,
			archived: (path: string) => `Archivado: ${path}`,
			failed: "Error al generar el informe diario:",
			skippedNotice: (dates) => `Se omitieron ${dates.length} informe(s) existente(s) (no sobrescrito(s)): ${joinLatin(dates)}`,
		},
	},
	pt: {
		dailyBatch: {
			overwriteTitle: "Sobrescrever relatórios existentes?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`Novos (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`Sobrescrever (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Relatórios de sessão de vários dias",
			generated: (count: number) => `Relatórios diários gerados e arquivados (${count}):`,
			archived: (path: string) => `Arquivado: ${path}`,
			failed: "Falha ao gerar relatório diário:",
			skippedNotice: (dates) => `${dates.length} relatório(s) existente(s) ignorado(s) (não sobrescrito(s)): ${joinLatin(dates)}`,
		},
	},
	ru: {
		dailyBatch: {
			overwriteTitle: "Перезаписать существующие отчёты?",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`Новые (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`Перезаписать (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "Отчёты о сеансах за несколько дней",
			generated: (count: number) => `Созданные и архивированные ежедневные отчёты (${count}):`,
			archived: (path: string) => `Архивировано: ${path}`,
			failed: "Не удалось создать ежедневный отчёт:",
			skippedNotice: (dates) => `Пропущено ${dates.length} существующих отчёт(ов) (не перезаписано): ${joinLatin(dates)}`,
		},
	},
	ar: {
		dailyBatch: {
			overwriteTitle: "هل تريد الكتابة فوق التقارير الموجودة؟",
			overwriteBody: (newDates, existingDates) => {
				const parts: string[] = [];
				if (newDates.length > 0) parts.push(`جديد (${newDates.length}): ${joinLatin(newDates)}`);
				parts.push(`الكتابة فوق (${existingDates.length}): ${joinLatin(existingDates)}`);
				return parts.join("\n");
			},
			title: "تقارير الجلسات لعدة أيام",
			generated: (count: number) => `التقارير اليومية التي تم إنشاؤها وأرشفتها (${count}):`,
			archived: (path: string) => `مؤرشف: ${path}`,
			failed: "فشل إنشاء التقرير اليومي:",
			skippedNotice: (dates) => `تم تخطي ${dates.length} تقرير/تقارير موجودة (لم تتم الكتابة فوقها): ${joinLatin(dates)}`,
		},
	},
};

export function dailyUiLabelsFor(lang: UiLocale): DailyUiLabels {
	return L[lang] ?? L.en;
}
