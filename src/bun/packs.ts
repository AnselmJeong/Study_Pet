// 사용자 캐릭터 팩: 앱 데이터 폴더의 packs/<id>/ 에 둔다.
// WebView는 파일을 직접 못 읽으니 이미지를 data URL로 바꿔서 보낸다.

import { Utils } from "electrobun/main";
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { basename, extname, join, normalize, relative, resolve, sep } from "node:path";
import { IMAGE_EXT, type PackFiles, type PackInfo, type ResolvedPack, resolvePack } from "../shared/pack";
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
		canChooseFiles: false,
		canChooseDirectory: true,
		allowsMultipleSelection: false,
	});
	const src = picked.find((p) => p && p.trim());
	if (!src) return { ok: false, canceled: true };
	return importPack(src);
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
		filter: (p) => !basename(p).startsWith(".") || p === src,
	});
	cache.delete(pack.id);
	const again = getPack(pack.id);
	if (!again) return { ok: false, error: "복사한 뒤 다시 읽지 못했어" };
	return { ok: true, info: toInfo(again), error: errors.length ? `일부 문제: ${errors.join("; ")}` : undefined };
}

export function removePack(id: string): boolean {
	const dir = join(packsDir, id);
	if (!/^[a-z0-9-]+$/.test(id) || !existsSync(dir)) return false;
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
