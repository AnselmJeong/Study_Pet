// 화면 캡처: macOS `screencapture`로 JPEG를 만들고 `sips`로 줄인다.
// 최근 MAX_SHOTS장만 링버퍼로 보관한다 (M1에서 1분 주기 캡처에 그대로 재사용).

import { Utils } from "electrobun/main";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { dataDir } from "./settings";

const MAX_SHOTS = 20;
const MAX_EDGE = 1568; // 긴 변 최대 픽셀
const shotsDir = join(dataDir, "shots");
if (!existsSync(shotsDir)) mkdirSync(shotsDir, { recursive: true });

export type Shot = { path: string; ts: number };

export function hasScreenPermission(): boolean {
	return Utils.screenCapture.hasAccess();
}

export function requestScreenPermission(): boolean {
	const granted = Utils.screenCapture.requestAccess();
	if (!granted) Utils.screenCapture.openSettings();
	return granted;
}

/** 현재 메인 화면을 캡처해서 파일로 저장. 권한이 없거나 실패하면 null */
export async function captureScreen(): Promise<Shot | null> {
	if (process.platform !== "darwin") return null;
	if (!hasScreenPermission()) return null;

	const ts = Date.now();
	const path = join(shotsDir, `${ts}.jpg`);
	// -x: 소리 없음, -m: 메인 디스플레이만, -t jpg
	const cap = Bun.spawn(["/usr/sbin/screencapture", "-x", "-m", "-t", "jpg", path], {
		stdout: "ignore",
		stderr: "pipe",
	});
	if ((await cap.exited) !== 0 || !existsSync(path)) {
		console.error("[capture] screencapture 실패", await new Response(cap.stderr).text());
		return null;
	}
	const resize = Bun.spawn(
		["/usr/bin/sips", "-Z", String(MAX_EDGE), "-s", "formatOptions", "70", path],
		{ stdout: "ignore", stderr: "ignore" },
	);
	await resize.exited;
	pruneShots();
	return { path, ts };
}

export function listShots(): Shot[] {
	return readdirSync(shotsDir)
		.filter((f) => f.endsWith(".jpg"))
		.map((f) => ({ path: join(shotsDir, f), ts: Number(f.replace(".jpg", "")) }))
		.filter((s) => Number.isFinite(s.ts))
		.sort((a, b) => a.ts - b.ts);
}

function pruneShots() {
	const shots = listShots();
	for (const s of shots.slice(0, Math.max(0, shots.length - MAX_SHOTS))) {
		try {
			unlinkSync(s.path);
		} catch {}
	}
}

export async function shotToDataUrl(shot: Shot): Promise<string> {
	const bytes = await Bun.file(shot.path).arrayBuffer();
	return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

export function shotSizeKb(shot: Shot): number {
	return Math.round(statSync(shot.path).size / 1024);
}
