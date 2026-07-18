import { promises as fs } from "node:fs";
import path from "node:path";

export interface DailyArchiveResult {
	path: string;
	overwritten: boolean;
}

export async function saveDailyReport(date: string, markdown: string, outputDir: string): Promise<DailyArchiveResult> {
	const target = path.join(outputDir, `${date}.md`);
	let overwritten = false;
	try {
		await fs.access(target);
		overwritten = true;
	} catch {
		// New report file.
	}
	await fs.mkdir(outputDir, { recursive: true });
	await fs.writeFile(target, markdown, "utf8");
	return { path: target, overwritten };
}

/** 探测指定日期的日报归档文件是否已存在，不写入。供覆盖确认前判断。 */
export async function probeDailyReportExists(date: string, outputDir: string): Promise<boolean> {
	const target = path.join(outputDir, `${date}.md`);
	try {
		await fs.access(target);
		return true;
	} catch {
		return false;
	}
}
