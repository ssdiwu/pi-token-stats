// /insights daily 命令层的 UI 文案字典（确认框、批量标题、归档提示、失败提示等）。
// 与日报正文内部的 report-labels.ts 分离，避免单一字典职责膨胀。

import type { UiLocale } from "./types.ts";

export interface DailyBatchLabels {
	confirmTitle: string;
	confirmBody: (count: number, dates: string) => string;
	cancelled: string;
	title: string;
	generated: (count: number) => string;
	archived: (path: string) => string;
	failed: string;
}

export interface DailyUiLabels {
	dailyBatch: DailyBatchLabels;
}

const L: Record<UiLocale, DailyUiLabels> = {
	"zh-CN": {
		dailyBatch: {
			confirmTitle: "确认补写日报？",
			confirmBody: (count: number, dates: string) => `将生成并归档 ${count} 篇日报：${dates}`,
			cancelled: "已取消日报补写，未生成或归档文件。",
			title: "多天会话日报",
			generated: (count: number) => `已生成并归档 ${count} 篇日报：`,
			archived: (path: string) => `已归档：${path}`,
			failed: "日报生成失败：",
		},
	},
	"zh-TW": {
		dailyBatch: {
			confirmTitle: "確認補寫日報？",
			confirmBody: (count: number, dates: string) => `將產生並歸檔 ${count} 篇日報：${dates}`,
			cancelled: "已取消日報補寫，未產生或歸檔檔案。",
			title: "多天會話日報",
			generated: (count: number) => `已產生並歸檔 ${count} 篇日報：`,
			archived: (path: string) => `已歸檔：${path}`,
			failed: "日報生成失敗：",
		},
	},
	en: {
		dailyBatch: {
			confirmTitle: "Generate daily reports?",
			confirmBody: (count: number, dates: string) => `Generate and archive ${count} daily report(s): ${dates}`,
			cancelled: "Daily report batch cancelled. No files were generated or archived.",
			title: "Multi-day session reports",
			generated: (count: number) => `Generated and archived ${count} daily report(s):`,
			archived: (path: string) => `Archived: ${path}`,
			failed: "Daily report generation failed:",
		},
	},
	ja: {
		dailyBatch: {
			confirmTitle: "日報を生成しますか？",
			confirmBody: (count: number, dates: string) => `${count} 件の日報を生成して保存します：${dates}`,
			cancelled: "日報の生成をキャンセルしました。ファイルは生成・保存されていません。",
			title: "複数日のセッションレポート",
			generated: (count: number) => `生成して保存した日報 ${count} 件：`,
			archived: (path: string) => `保存済み：${path}`,
			failed: "日報の生成に失敗しました：",
		},
	},
	ko: {
		dailyBatch: {
			confirmTitle: "일일 보고서를 생성하시겠습니까?",
			confirmBody: (count: number, dates: string) => `${count}개의 일일 보고서를 생성 및 보관합니다: ${dates}`,
			cancelled: "일일 보고서 일괄 작업이 취소되었습니다. 파일이 생성되거나 보관되지 않았습니다.",
			title: "여러 날의 세션 보고서",
			generated: (count: number) => `생성 및 보관된 일일 보고서 ${count}개:`,
			archived: (path: string) => `보관됨: ${path}`,
			failed: "일일 보고서 생성 실패:",
		},
	},
	de: {
		dailyBatch: {
			confirmTitle: "Tagesberichte erstellen?",
			confirmBody: (count: number, dates: string) => `${count} Tagesberichte erstellen und archivieren: ${dates}`,
			cancelled: "Tagesbericht-Stapel abgebrochen. Es wurden keine Dateien erstellt oder archiviert.",
			title: "Mehrere Sitzungsberichte",
			generated: (count: number) => `Erstellte und archivierte Tagesberichte (${count}):`,
			archived: (path: string) => `Archiviert: ${path}`,
			failed: "Tagesbericht konnte nicht erstellt werden:",
		},
	},
	fr: {
		dailyBatch: {
			confirmTitle: "Générer les rapports quotidiens ?",
			confirmBody: (count: number, dates: string) => `Générer et archiver ${count} rapport(s) quotidien(s) : ${dates}`,
			cancelled: "Génération groupée de rapports quotidiens annulée. Aucun fichier n'a été créé ni archivé.",
			title: "Rapports de session sur plusieurs jours",
			generated: (count: number) => `Rapport(s) quotidien(s) généré(s) et archivé(s) (${count}) :`,
			archived: (path: string) => `Archivé : ${path}`,
			failed: "Échec de la génération du rapport quotidien :",
		},
	},
	es: {
		dailyBatch: {
			confirmTitle: "¿Generar informes diarios?",
			confirmBody: (count: number, dates: string) => `Generar y archivar ${count} informe(s) diario(s): ${dates}`,
			cancelled: "Lote de informes diarios cancelado. No se generó ni archivó ningún archivo.",
			title: "Informes de sesión de varios días",
			generated: (count: number) => `Informes diarios generados y archivados (${count}):`,
			archived: (path: string) => `Archivado: ${path}`,
			failed: "Error al generar el informe diario:",
		},
	},
	pt: {
		dailyBatch: {
			confirmTitle: "Gerar relatórios diários?",
			confirmBody: (count: number, dates: string) => `Gerar e arquivar ${count} relatório(s) diário(s): ${dates}`,
			cancelled: "Lote de relatórios diários cancelado. Nenhum arquivo foi gerado ou arquivado.",
			title: "Relatórios de sessão de vários dias",
			generated: (count: number) => `Relatórios diários gerados e arquivados (${count}):`,
			archived: (path: string) => `Arquivado: ${path}`,
			failed: "Falha ao gerar relatório diário:",
		},
	},
	ru: {
		dailyBatch: {
			confirmTitle: "Создать ежедневные отчёты?",
			confirmBody: (count: number, dates: string) => `Создать и заархивировать ${count} ежедневн(ый/ых) отчёт(ов): ${dates}`,
			cancelled: "Пакетная генерация ежедневных отчётов отменена. Файлы не были созданы или заархивированы.",
			title: "Отчёты о сеансах за несколько дней",
			generated: (count: number) => `Созданные и архивированные ежедневные отчёты (${count}):`,
			archived: (path: string) => `Архивировано: ${path}`,
			failed: "Не удалось создать ежедневный отчёт:",
		},
	},
	ar: {
		dailyBatch: {
			confirmTitle: "هل تريد إنشاء التقارير اليومية؟",
			confirmBody: (count: number, dates: string) => `إنشاء وأرشفة ${count} تقرير/تقارير يومية: ${dates}`,
			cancelled: "تم إلغاء دفعة التقارير اليومية. لم يتم إنشاء أو أرشفة أي ملفات.",
			title: "تقارير الجلسات لعدة أيام",
			generated: (count: number) => `التقارير اليومية التي تم إنشاؤها وأرشفتها (${count}):`,
			archived: (path: string) => `مؤرشف: ${path}`,
			failed: "فشل إنشاء التقرير اليومي:",
		},
	},
};

export function dailyUiLabelsFor(lang: UiLocale): DailyUiLabels {
	return L[lang] ?? L.en;
}
