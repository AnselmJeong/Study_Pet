// 사용자 캐릭터 팩: 앱 데이터 폴더의 packs/<id>/ 에 둔다.
// WebView는 파일을 직접 못 읽으니 이미지를 data URL로 바꿔서 보낸다.

import { Utils } from "electrobun/main";
import { tmpdir } from "node:os";
import { cpSync, existsSync, lstatSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, normalize, relative, resolve, sep } from "node:path";
import { IMAGE_EXT, PACK_ID, type PackFiles, type PackInfo, type ResolvedPack, resolvePack } from "../shared/pack";
import { dataDir } from "./settings";

export const packsDir = join(dataDir, "packs");
if (!existsSync(packsDir)) mkdirSync(packsDir, { recursive: true });

/** 팩 하나의 이미지 총량 상한 (data URL로 창마다 보내므로) */
const MAX_BYTES = 40 * 1024 * 1024;

const MIME: Record<string, string> = {
	".png": "image/png",
	".webp": "image/webp",
	".gif": "image/gif",
	".jpg": "image/jpeg",
	".jpeg": "image/jpeg",
	".svg": "image/svg+xml",
};

function filesFor(root: string, budget = { left: MAX_BYTES }): PackFiles {
	const inside = (rel: string) => {
		const p = resolve(root, normalize(rel));
		return p === root || p.startsWith(root + sep) ? p : null;
	};
	return {
		list(dir) {
			const p = inside(dir);
			if (!p || !existsSync(p)) return [];
			return readdirSync(p).filter((n) => !n.startsWith("."));
		},
		url(rel) {
			const p = inside(rel);
			if (!p || !IMAGE_EXT.test(p) || !existsSync(p) || !statSync(p).isFile()) return null;
			const buf = readFileSync(p);
			budget.left -= buf.length;
			if (budget.left < 0) throw new Error("이미지가 너무 커 (팩 전체 40MB까지)");
			return `data:${MIME[extname(p).toLowerCase()] ?? "application/octet-stream"};base64,${buf.toString("base64")}`;
		},
	};
}

function readManifest(dir: string): unknown {
	const p = join(dir, "pack.json");
	if (!existsSync(p)) throw new Error("pack.json이 없어");
	try {
		return JSON.parse(readFileSync(p, "utf8"));
	} catch (err) {
		throw new Error(`pack.json을 읽을 수 없어: ${(err as Error).message}`);
	}
}

const cache = new Map<string, ResolvedPack>();

function load(dir: string): { pack?: ResolvedPack; errors: string[] } {
	try {
		return resolvePack(readManifest(dir), filesFor(resolve(dir)));
	} catch (err) {
		return { errors: [(err as Error).message] };
	}
}

/** 가져온 팩 하나를 그릴 수 있게 읽는다 (없거나 깨졌으면 null) */
export function getPack(id: string): ResolvedPack | null {
	if (!PACK_ID.test(id)) return null; // WebView에서 온 id: packs/ 밖 경로 방지
	const hit = cache.get(id);
	if (hit) return hit;
	const dir = join(packsDir, id);
	if (!existsSync(dir)) return null;
	const { pack, errors } = load(dir);
	if (errors.length) console.warn(`[packs] ${id}:`, errors.join("; "));
	if (pack) cache.set(id, pack);
	return pack ?? null;
}

export function listUserPacks(): PackInfo[] {
	const out: PackInfo[] = [];
	for (const id of readdirSync(packsDir)) {
		const dir = join(packsDir, id);
		if (id.startsWith(".") || !statSync(dir).isDirectory()) continue;
		const pack = getPack(id);
		if (pack) {
			out.push({ id, name: pack.name, author: pack.author, description: pack.description, builtin: false, preview: pack.preview });
		} else {
			out.push({ id, name: id, builtin: false, error: load(dir).errors.join("; ") || "읽을 수 없어" });
		}
	}
	return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** 폴더를 골라서 packs/<id>/ 로 복사한다. 같은 id가 있으면 덮어쓴다 */
export async function importPackFromDialog(): Promise<{ ok: boolean; info?: PackInfo; error?: string; canceled?: boolean }> {
	const picked = await Utils.openFileDialog({
		canChooseFiles: true,
		canChooseDirectory: true,
		allowsMultipleSelection: false,
	});
	const src = picked.find((p) => p && p.trim());
	if (!src) return { ok: false, canceled: true };
	if (/\.zip$/i.test(src)) return importPackZip(src);
	if (!statSync(src).isDirectory()) return { ok: false, error: "팩 폴더나 .zip 파일을 골라 줘" };
	return importPack(src);
}

/** pack.json이 있는 폴더를 찾는다: 맨 위 또는 그 아래 폴더 (zip을 풀면 한 단계 들어가 있는 경우가 많다) */
function findPackRoot(dir: string, depth = 0): string | null {
	if (existsSync(join(dir, "pack.json"))) return dir;
	if (depth >= 2) return null;
	for (const n of readdirSync(dir)) {
		if (n.startsWith(".") || n === "__MACOSX") continue;
		const p = join(dir, n);
		if (statSync(p).isDirectory()) {
			const hit = findPackRoot(p, depth + 1);
			if (hit) return hit;
		}
	}
	return null;
}

/** zip 풀기 전 상한: 압축 폭탄, 경로 탈출(../, 절대 경로), 심볼릭 링크를 막는다 */
const ZIP_MAX_UNCOMPRESSED = 200 * 1024 * 1024;
const ZIP_MAX_ENTRIES = 2000;

function zipinfo(args: string[], zipPath: string): string | null {
	const r = Bun.spawnSync(["/usr/bin/zipinfo", ...args, zipPath], { stdout: "pipe", stderr: "pipe" });
	return r.exitCode === 0 ? r.stdout.toString() : null;
}

export function checkZip(zipPath: string): string | null {
	const names = zipinfo(["-1"], zipPath);
	if (names === null) return "zip 목록을 읽지 못했어 (깨진 zip일 수 있어)";
	const list = names.split("\n").filter(Boolean);
	if (list.length > ZIP_MAX_ENTRIES) return `파일이 너무 많아 (${list.length}개, ${ZIP_MAX_ENTRIES}개까지)`;
	for (const n of list) {
		if (n.startsWith("/") || n.startsWith("~") || n.split(/[\\/]/).includes("..")) return `허용하지 않는 경로가 있어: ${n}`;
	}
	// 긴 형식 목록의 첫 글자 l = 심볼릭 링크
	const long = zipinfo(["-l"], zipPath) ?? "";
	if (long.split("\n").some((l) => /^l[rwx-]{9}/.test(l))) return "zip 안에 심볼릭 링크가 있어";
	// 맨 끝 요약 줄: "N files, X bytes uncompressed, Y bytes compressed"
	const m = /([0-9]+) bytes uncompressed/.exec(zipinfo(["-t"], zipPath) ?? "");
	if (!m) return "zip 크기를 확인하지 못했어";
	if (Number(m[1]) > ZIP_MAX_UNCOMPRESSED) return `풀면 너무 커 (${Math.round(Number(m[1]) / 1048576)}MB, 200MB까지)`;
	return null;
}

/** .zip을 임시 폴더에 풀어서 가져온다 (macOS 기본 ditto 사용) */
export function importPackZip(zipPath: string): { ok: boolean; info?: PackInfo; error?: string } {
	const bad = checkZip(zipPath);
	if (bad) return { ok: false, error: bad };
	const tmp = mkdtempSync(join(tmpdir(), "studypet-pack-"));
	try {
		const r = Bun.spawnSync(["/usr/bin/ditto", "-x", "-k", zipPath, tmp], { stderr: "pipe" });
		if (r.exitCode !== 0) return { ok: false, error: `zip을 풀지 못했어: ${r.stderr.toString().trim()}` };
		const root = findPackRoot(tmp);
		if (!root) return { ok: false, error: "zip 안에서 pack.json을 찾지 못했어" };
		return importPack(root);
	} finally {
		rmSync(tmp, { recursive: true, force: true });
	}
}

export function importPack(srcDir: string): { ok: boolean; info?: PackInfo; error?: string } {
	const src = resolve(srcDir);
	const { pack, errors } = load(src);
	if (!pack) return { ok: false, error: errors.join("\n") || "팩을 읽을 수 없어" };
	const dest = join(packsDir, pack.id);
	if (relative(dest, src) === "") return { ok: true, info: toInfo(pack) };
	rmSync(dest, { recursive: true, force: true });
	cpSync(src, dest, {
		recursive: true,
		// 숨김 파일과 심볼릭 링크(팩 밖 파일을 가리킬 수 있음)는 복사하지 않는다
		filter: (p) => p === src || (!basename(p).startsWith(".") && !lstatSync(p).isSymbolicLink()),
	});
	cache.delete(pack.id);
	const again = getPack(pack.id);
	if (!again) return { ok: false, error: "복사한 뒤 다시 읽지 못했어" };
	return { ok: true, info: toInfo(again), error: errors.length ? `일부 문제: ${errors.join("; ")}` : undefined };
}

export function removePack(id: string): boolean {
	const dir = join(packsDir, id);
	if (!PACK_ID.test(id) || !existsSync(dir)) return false;
	rmSync(dir, { recursive: true, force: true });
	cache.delete(id);
	return true;
}

export function openPacksFolder() {
	Utils.openPath(packsDir);
}

function toInfo(p: ResolvedPack): PackInfo {
	return { id: p.id, name: p.name, author: p.author, description: p.description, builtin: false, preview: p.preview };
}
