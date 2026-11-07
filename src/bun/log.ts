// 진단용 로그: userData/inky.log (200줄 넘으면 앞부분 버림). 화면 내용은 절대 적지 않는다.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./settings";

const logPath = join(dataDir, "inky.log");
const MAX_LINES = 200;

export function appLog(line: string) {
	try {
		const prev = existsSync(logPath) ? readFileSync(logPath, "utf8").split("\n").filter(Boolean).slice(-(MAX_LINES - 1)) : [];
		writeFileSync(logPath, [...prev, `${new Date().toISOString()} ${line}`].join("\n") + "\n");
	} catch {}
}
