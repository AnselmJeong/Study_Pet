// 화면 캡처: macOS `screencapture`로 JPEG를 만들고 `sips`로 줄인다.
// 스크린샷은 개수(maxShots)와 보관 시간(retentionMin) 두 기준으로 자동 삭제한다.

import { Utils } from "electrobun/main";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import { dataDir, getSettings } from "./settings";

const MAX_EDGE = 1568; // 긴 변 최대 픽셀
export const shotsDir = join(dataDir, "shots");
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

/** 현재 맨 앞에 있는 앱 이름 (권한 없이 쓸 수 있는 lsappinfo 사용) */
export function frontmostApp(): string {
	if (process.platform !== "darwin") return "";
	try {
		const front = Bun.spawnSync(["/usr/bin/lsappinfo", "front"], { stdout: "pipe" }).stdout.toString().trim();
		if (!front) return "";
		const info = Bun.spawnSync(["/usr/bin/lsappinfo", "info", "-only", "name", front], { stdout: "pipe" })
			.stdout.toString();
		const m = info.match(/"(?:LSDisplayName|name)"="([^"]*)"/i) ?? info.match(/=\s*"([^"]+)"/);
		return m?.[1] ?? "";
	} catch {
		return "";
	}
}

/** 마지막 키보드/마우스 입력 이후 지난 초 */
export function idleSeconds(): number {
	if (process.platform !== "darwin") return 0;
	try {
		const out = Bun.spawnSync(["/usr/sbin/ioreg", "-c", "IOHIDSystem", "-d", "4"], { stdout: "pipe" }).stdout.toString();
		const m = out.match(/"HIDIdleTime"\s*=\s*(\d+)/);
		return m ? Number(m[1]) / 1e9 : 0;
	} catch {
		return 0;
	}
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

/** 개수 초과분과 보관 시간이 지난 스크린샷을 지운다. 지운 개수를 돌려준다 */
export function pruneShots(): number {
	const { maxShots, retentionMin } = getSettings().capture;
	const cutoff = Date.now() - retentionMin * 60_000;
	const shots = listShots();
	const overflow = Math.max(0, shots.length - maxShots);
	let removed = 0;
	shots.forEach((s, i) => {
		if (i < overflow || s.ts < cutoff) {
			try {
				unlinkSync(s.path);
				removed++;
			} catch {}
		}
	});
	return removed;
}

export function deleteAllShots(): number {
	let n = 0;
	for (const s of listShots()) {
		try {
			unlinkSync(s.path);
			n++;
		} catch {}
	}
	return n;
}

// 캡처를 하지 않는 동안에도 오래된 스크린샷이 남지 않게 주기적으로 정리
pruneShots();
setInterval(() => pruneShots(), 5 * 60_000);

// ---------- 화면 변화 감지 ----------
// 스크린샷을 16x16 회색조로 줄여 직전 화면과 비교한다. 값은 0(같음)~255(완전히 다름).

const FP_SIZE = 16;

export async function fingerprint(path: string): Promise<Uint8Array | null> {
	const tmp = `${path}.fp.bmp`;
	try {
		const p = Bun.spawn(
			["/usr/bin/sips", "-z", String(FP_SIZE), String(FP_SIZE), "-s", "format", "bmp", path, "--out", tmp],
			{ stdout: "ignore", stderr: "ignore" },
		);
		if ((await p.exited) !== 0) return null;
		const buf = new Uint8Array(await Bun.file(tmp).arrayBuffer());
		const dv = new DataView(buf.buffer);
		const offset = dv.getUint32(10, true);
		const w = dv.getInt32(18, true);
		const hRaw = dv.getInt32(22, true);
		const h = Math.abs(hRaw);
		const bpp = dv.getUint16(28, true);
		if (bpp !== 24 && bpp !== 32) return null;
		const bytesPP = bpp / 8;
		const rowSize = Math.ceil((w * bytesPP) / 4) * 4;
		const out = new Uint8Array(w * h);
		for (let y = 0; y < h; y++) {
			const row = hRaw > 0 ? h - 1 - y : y; // 양수 높이면 아래에서 위로 저장됨
			for (let x = 0; x < w; x++) {
				const i = offset + row * rowSize + x * bytesPP;
				const b = buf[i], g = buf[i + 1], r = buf[i + 2];
				out[y * w + x] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
			}
		}
		return out;
	} catch {
		return null;
	} finally {
		try {
			unlinkSync(tmp);
		} catch {}
	}
}

/** 두 지문의 평균 밝기 차이 (0~255). 비교할 수 없으면 255 */
export function fingerprintDiff(a: Uint8Array | null, b: Uint8Array | null): number {
	if (!a || !b || a.length !== b.length) return 255;
	let sum = 0;
	for (let i = 0; i < a.length; i++) sum += Math.abs(a[i] - b[i]);
	return sum / a.length;
}

export function deleteShot(path: string) {
	try {
		unlinkSync(path);
	} catch {}
}
