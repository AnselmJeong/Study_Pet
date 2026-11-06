// 질문에 붙이는 이미지 (붙여넣기 / 끌어놓기 / 지금 화면 / 영역 캡처).
// 모두 userData/attachments/<id>.jpg 로 저장하고 `sips -Z 1568`로 줄인다.
// 답을 받으면 지우고, 보내지 않은 채 남은 파일은 보관 시간(capture.retentionMin)이 지나면 정리한다.

import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { AttachResult, Attachment } from "../shared/types";
import { hasScreenPermission } from "./capture";
import { dataDir, getSettings } from "./settings";

const MAX_EDGE = 1568;
const THUMB_EDGE = 160;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS = 4;

export const attachDir = join(dataDir, "attachments");
if (!existsSync(attachDir)) mkdirSync(attachDir, { recursive: true });

const ID_RE = /^[a-z0-9]{6,32}$/;

function newId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function attachmentPath(id: string): string | null {
	if (!ID_RE.test(id)) return null;
	const p = join(attachDir, `${id}.jpg`);
	return existsSync(p) ? p : null;
}

async function run(cmd: string[]): Promise<{ code: number; err: string }> {
	const p = Bun.spawn(cmd, { stdout: "ignore", stderr: "pipe" });
	const code = await p.exited;
	return { code, err: await new Response(p.stderr).text() };
}

/** src 이미지를 JPEG(긴 변 1568px)로 바꿔 out에 저장 */
async function normalize(src: string, out: string): Promise<boolean> {
	const r = await run(["/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "80", "-Z", String(MAX_EDGE), src, "--out", out]);
	if (r.code !== 0 || !existsSync(out)) {
		console.error("[attach] sips 실패", r.err);
		return false;
	}
	return true;
}

async function thumbnail(path: string): Promise<string> {
	const tmp = `${path}.thumb.jpg`;
	try {
		await run(["/usr/bin/sips", "-s", "format", "jpeg", "-s", "formatOptions", "60", "-Z", String(THUMB_EDGE), path, "--out", tmp]);
		const b = await Bun.file(tmp).arrayBuffer();
		return `data:image/jpeg;base64,${Buffer.from(b).toString("base64")}`;
	} catch {
		return "";
	} finally {
		try {
			unlinkSync(tmp);
		} catch {}
	}
}

const thumbs = new Map<string, string>();

export function thumbOf(id: string): string {
	return thumbs.get(id) ?? "";
}

async function finish(id: string, kind: Attachment["kind"]): Promise<AttachResult> {
	const path = join(attachDir, `${id}.jpg`);
	const thumb = await thumbnail(path);
	thumbs.set(id, thumb);
	return { ok: true, attachment: { id, kind, thumb } };
}

/** WebView가 보낸 base64 이미지(붙여넣기·끌어놓기)를 저장 */
export async function addFromData(data: string, mime: string): Promise<AttachResult> {
	const b64 = data.includes(",") ? data.slice(data.indexOf(",") + 1) : data;
	const bytes = Buffer.from(b64, "base64");
	if (!bytes.length) return { ok: false, reason: "failed", message: "빈 이미지야" };
	if (bytes.length > MAX_UPLOAD_BYTES) return { ok: false, reason: "failed", message: "이미지가 너무 커 (25MB 이하만)" };
	const id = newId();
	const ext = (mime.split("/")[1] || "img").replace(/[^a-z0-9]/gi, "").slice(0, 8) || "img";
	const raw = join(attachDir, `${id}.src.${ext}`);
	try {
		await Bun.write(raw, bytes);
		if (!(await normalize(raw, join(attachDir, `${id}.jpg`)))) {
			return { ok: false, reason: "failed", message: "이 이미지 형식은 읽을 수 없어" };
		}
		return await finish(id, "image");
	} finally {
		try {
			unlinkSync(raw);
		} catch {}
	}
}

export type HideFn = () => Promise<() => void>;

/**
 * 화면 캡처해서 첨부. mode "screen" = 메인 화면 전체, "region" = 사용자가 고르는 영역/창 (`screencapture -i`).
 * hide()는 펫 창 등을 숨기고, 다시 보이게 하는 함수를 돌려준다.
 */
export async function addFromCapture(mode: "screen" | "region", hide: HideFn): Promise<AttachResult> {
	if (process.platform !== "darwin") return { ok: false, reason: "failed", message: "macOS에서만 돼" };
	if (!hasScreenPermission()) {
		return { ok: false, reason: "permission", message: "화면 기록 권한이 꺼져 있어요" };
	}
	const id = newId();
	const raw = join(attachDir, `${id}.cap.png`);
	const restore = await hide();
	let r: { code: number; err: string };
	try {
		r =
			mode === "region"
				? await run(["/usr/sbin/screencapture", "-i", "-x", "-t", "png", raw])
				: await run(["/usr/sbin/screencapture", "-x", "-m", "-t", "png", raw]);
	} finally {
		restore();
	}
	try {
		// -i에서 Esc로 취소하면 파일이 안 생긴다 (종료 코드는 0 또는 1)
		if (!existsSync(raw) || statSync(raw).size === 0) {
			if (mode === "region") return { ok: false, reason: "canceled" };
			console.error("[attach] screencapture 실패", r.code, r.err);
			return { ok: false, reason: "failed", message: "화면 캡처에 실패했어" };
		}
		if (!(await normalize(raw, join(attachDir, `${id}.jpg`)))) {
			return { ok: false, reason: "failed", message: "캡처 이미지를 변환하지 못했어" };
		}
		return await finish(id, mode);
	} finally {
		try {
			unlinkSync(raw);
		} catch {}
	}
}

export function discard(id: string) {
	thumbs.delete(id);
	const p = attachmentPath(id);
	if (p) {
		try {
			unlinkSync(p);
		} catch {}
	}
}

/** 보관 시간이 지난 첨부 파일 정리 (보내지 않고 남은 것 포함) */
export function pruneAttachments(all = false): number {
	const cutoff = Date.now() - getSettings().capture.retentionMin * 60_000;
	let n = 0;
	for (const f of readdirSync(attachDir)) {
		const p = join(attachDir, f);
		try {
			if (all || statSync(p).mtimeMs < cutoff) {
				unlinkSync(p);
				thumbs.delete(f.replace(/\..*$/, ""));
				n++;
			}
		} catch {}
	}
	return n;
}

// 앱을 다시 켜면 이전 첨부는 쓸 일이 없으므로 모두 지운다
pruneAttachments(true);
setInterval(() => pruneAttachments(), 5 * 60_000);
