/// <reference types="vite/client" />
// 앱에 함께 들어가는 캐릭터 팩 (src/views/packs/<id>/). Vite가 이미지를 번들에 넣는다.

import { type PackInfo, type ResolvedPack, resolvePack } from "../../shared/pack";

const manifests = import.meta.glob("../packs/*/pack.json", { eager: true, import: "default" }) as Record<string, unknown>;
const images = import.meta.glob("../packs/*/**/*.{png,webp,gif,jpg,jpeg,svg}", {
	eager: true,
	query: "?url",
	import: "default",
}) as Record<string, string>;

const packs = new Map<string, ResolvedPack>();

for (const [path, manifest] of Object.entries(manifests)) {
	const root = path.slice(0, -"pack.json".length); // "../packs/<id>/"
	const { pack, errors } = resolvePack(manifest, {
		list(dir) {
			const prefix = root + (dir ? dir.replace(/\/$/, "") + "/" : "");
			return Object.keys(images)
				.filter((k) => k.startsWith(prefix) && !k.slice(prefix.length).includes("/"))
				.map((k) => k.slice(prefix.length));
		},
		url: (rel) => images[root + rel] ?? null,
	});
	if (errors.length) console.warn(`[packs] 기본 팩 ${path}:`, errors);
	if (pack) packs.set(pack.id, pack);
}

export function builtinPack(id: string): ResolvedPack | null {
	return packs.get(id) ?? null;
}

export function builtinPackInfos(): PackInfo[] {
	return [...packs.values()].map((p) => ({
		id: p.id,
		name: p.name,
		author: p.author,
		description: p.description,
		builtin: true,
		preview: p.preview,
	}));
}
