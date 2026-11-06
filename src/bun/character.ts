// 지금 고른 캐릭터(팩)의 이름·성격을 Bun 쪽에서 알아낸다.
// 앱 기본 팩(요미)은 WebView 번들에 들어 있으므로 pack.json만 여기서 따로 읽어 둔다.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { type CharacterInfo, characterFromManifest, INKY_CHARACTER } from "../shared/character";
import { INKY_ID, PACK_ID } from "../shared/pack";
import yomi from "../views/packs/yomi/pack.json";
import { packsDir } from "./packs";
import { getSettings } from "./settings";

const BUILTIN: Record<string, unknown> = { yomi };

let cached: { id: string; mtime: number; info: CharacterInfo } | null = null;

export function currentCharacter(): CharacterInfo {
	const id = getSettings().petPackId || INKY_ID;
	if (id === INKY_ID || !PACK_ID.test(id)) return INKY_CHARACTER;
	const path = join(packsDir, id, "pack.json");
	if (existsSync(path)) {
		try {
			const mtime = Bun.file(path).lastModified;
			if (cached && cached.id === id && cached.mtime === mtime) return cached.info;
			const info = characterFromManifest(JSON.parse(readFileSync(path, "utf8")), id);
			cached = { id, mtime, info };
			return info;
		} catch (err) {
			console.warn(`[character] ${id} pack.json 읽기 실패`, err);
		}
	}
	if (BUILTIN[id]) return characterFromManifest(BUILTIN[id], id);
	return { id, name: id };
}
