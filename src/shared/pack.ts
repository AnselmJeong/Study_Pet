// 캐릭터 팩 형식. Bun(가져오기, 읽기)과 WebView(기본 팩)가 함께 쓴다.
// 형식 설명: docs/CHARACTER_PACKS.md

import type { PetAction, PetMood } from "./types";

export type PackStateName =
	| "idle"
	| "talk"
	| "think"
	| "happy"
	| "error"
	| "focus"
	| "read"
	| "wave"
	| "sleep"
	| "walk"
	| "hop"
	| "stretch"
	| "spin"
	| "look";

export const PACK_STATES: PackStateName[] = [
	"idle",
	"talk",
	"think",
	"happy",
	"error",
	"focus",
	"read",
	"wave",
	"sleep",
	"walk",
	"hop",
	"stretch",
	"spin",
	"look",
];

/** 없는 상태는 이 순서대로 대신 그린다 (마지막은 늘 idle) */
const FALLBACK: Partial<Record<PackStateName, PackStateName[]>> = {
	focus: ["read"],
	wave: ["happy"],
};

/** pack.json의 상태 하나: "파일", "폴더/", 또는 객체 */
export type PackStateSpec =
	| string
	| {
			frames?: string | string[];
			sheet?: string;
			columns?: number;
			rows?: number;
			count?: number;
			fps?: number;
			durations?: number[];
			loop?: boolean;
	  };

export type PackManifest = {
	format?: number;
	id: string;
	name: string;
	author?: string;
	description?: string;
	license?: string;
	preview?: string;
	height?: number;
	fps?: number;
	motion?: boolean;
	/** 캐릭터 소개 (대화 프롬프트에 들어감). 없으면 이름만 바꾼 기본 성격 */
	persona?: string;
	/** 말투 지시 (예: "느긋하고 다정한 반말, 가끔 차 이야기") */
	speech?: string;
	states: Partial<Record<PackStateName, PackStateSpec>>;
};

/** 화면에 바로 그릴 수 있게 풀어 놓은 상태 */
export type ResolvedState = {
	/** 프레임 이미지 URL (data: 또는 상대 URL). 시트면 한 장 */
	frames: string[];
	/** 프레임마다 보여 줄 시간 (ms) */
	durations: number[];
	loop: boolean;
	sheet?: { columns: number; rows: number; count: number };
};

export type ResolvedPack = {
	id: string;
	name: string;
	author?: string;
	description?: string;
	height: number;
	motion: boolean;
	preview?: string;
	states: Partial<Record<PackStateName, ResolvedState>>;
};

/** 설정 화면 목록용 요약 */
export type PackInfo = {
	id: string;
	name: string;
	author?: string;
	description?: string;
	/** 앱에 들어 있는 팩 (삭제 불가) */
	builtin: boolean;
	preview?: string;
	error?: string;
};

export const IMAGE_EXT = /\.(png|webp|gif|jpe?g|svg)$/i;
export const PACK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** 기본 잉키는 팩이 아니라 SVG 컴포넌트다 */
export const INKY_ID = "inky";

export type PackFiles = {
	/** 팩 폴더 기준 상대 경로 디렉터리 안의 파일 이름들 */
	list(dir: string): string[];
	/** 상대 경로 → 이미지 URL. 없는 파일이면 null */
	url(rel: string): string | null;
};

function clean(rel: string): string {
	return rel.replace(/^\.\//, "").replace(/\\/g, "/");
}

function expandFrames(spec: string | string[], files: PackFiles): string[] {
	const list = Array.isArray(spec) ? spec : [spec];
	const out: string[] = [];
	for (const raw of list) {
		const rel = clean(raw);
		if (rel.endsWith("/")) {
			const names = files
				.list(rel.slice(0, -1))
				.filter((n) => IMAGE_EXT.test(n))
				.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
			out.push(...names.map((n) => rel + n));
		} else out.push(rel);
	}
	return out;
}

function resolveState(spec: PackStateSpec, defaultFps: number, files: PackFiles, errors: string[], name: string): ResolvedState | null {
	const obj = typeof spec === "string" ? { frames: spec } : spec;
	const fps = Math.max(0.2, Math.min(30, obj.fps ?? defaultFps));
	let rels: string[];
	let sheet: ResolvedState["sheet"];
	if (obj.sheet) {
		rels = [clean(obj.sheet)];
		const columns = Math.max(1, Math.round(obj.columns ?? obj.count ?? 1));
		const rows = Math.max(1, Math.round(obj.rows ?? 1));
		const count = Math.max(1, Math.min(columns * rows, Math.round(obj.count ?? columns * rows)));
		sheet = { columns, rows, count };
	} else if (obj.frames) {
		rels = expandFrames(obj.frames, files);
	} else {
		errors.push(`${name}: frames나 sheet가 없어`);
		return null;
	}
	const frames: string[] = [];
	for (const rel of rels) {
		const u = files.url(rel);
		if (u) frames.push(u);
		else errors.push(`${name}: 파일 없음 ${rel}`);
	}
	if (!frames.length) return null;
	const n = sheet ? sheet.count : frames.length;
	const base = Math.round(1000 / fps);
	const durations = Array.from({ length: n }, (_, i) => {
		const d = obj.durations?.[i];
		return typeof d === "number" && d > 0 ? Math.min(60_000, d) : base;
	});
	return { frames, durations, loop: obj.loop ?? true, sheet };
}

/** pack.json을 검사하고 화면에 그릴 수 있는 형태로 푼다 */
export function resolvePack(raw: unknown, files: PackFiles): { pack?: ResolvedPack; errors: string[] } {
	const errors: string[] = [];
	const m = raw as Partial<PackManifest>;
	if (!m || typeof m !== "object") return { errors: ["pack.json이 객체가 아니야"] };
	if (typeof m.id !== "string" || !PACK_ID.test(m.id)) errors.push("id는 영문 소문자, 숫자, -만 (40자까지)");
	if (m.id === INKY_ID) errors.push(`id "${INKY_ID}"는 기본 캐릭터용이라 쓸 수 없어`);
	if (!m.states || typeof m.states !== "object") return { errors: [...errors, "states가 없어"] };
	if (!m.states.idle) errors.push("states.idle은 꼭 있어야 해");
	if (errors.length) return { errors };

	const fps = m.fps ?? 6;
	const states: ResolvedPack["states"] = {};
	for (const name of PACK_STATES) {
		const spec = m.states[name];
		if (!spec) continue;
		const st = resolveState(spec, fps, files, errors, name);
		if (st) states[name] = st;
	}
	if (!states.idle) return { errors: [...errors, "idle 이미지를 하나도 못 찾았어"] };
	const preview = (m.preview && files.url(clean(m.preview))) || states.idle.frames[0];
	return {
		pack: {
			id: m.id!,
			name: typeof m.name === "string" && m.name.trim() ? m.name.trim() : m.id!,
			author: m.author,
			description: m.description,
			height: Math.max(80, Math.min(260, Math.round(m.height ?? 140))),
			motion: m.motion ?? true,
			preview,
			states,
		},
		errors,
	};
}

/** 펫의 감정과 행동 → 그릴 상태 */
export function stateFor(mood: PetMood, action: PetAction): PackStateName {
	switch (action) {
		case "doze":
			return "sleep";
		case "lookAround":
			return "look";
		case "read":
		case "wave":
		case "walk":
		case "hop":
		case "stretch":
		case "spin":
			return action;
	}
	switch (mood) {
		case "talking":
			return "talk";
		case "thinking":
			return "think";
		case "happy":
			return "happy";
		case "error":
			return "error";
		case "focus":
			return "focus";
		default:
			return "idle";
	}
}

export function pickState(pack: ResolvedPack, want: PackStateName): { name: PackStateName; state: ResolvedState } {
	for (const name of [want, ...(FALLBACK[want] ?? []), "idle" as const]) {
		const st = pack.states[name];
		if (st) return { name, state: st };
	}
	return { name: "idle", state: pack.states.idle! };
}
