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
