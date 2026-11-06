// 지금 고른 캐릭터의 이름과 성격. 대화 프롬프트, 메뉴, 말풍선, 패널이 함께 쓴다.
// 앱 이름은 늘 "Inky"이고, 캐릭터 이름만 팩마다 바뀐다.

export type CharacterInfo = {
	/** 팩 id ("inky" = 기본 잉키) */
	id: string;
	name: string;
	/** pack.json "persona": 캐릭터 소개 (누구인지, 성격) */
	persona?: string;
	/** pack.json "speech": 말투 지시 */
	speech?: string;
};

export const INKY_CHARACTER: CharacterInfo = {
	id: "inky",
	name: "잉키",
	persona: "사용자의 PC 화면 구석에 사는 작은 잉크 방울 요정이고, 사용자가 연구와 공부를 하는 동안 옆에서 돕는다.",
};

const MAX_TEXT = 600;

function text(v: unknown, max = MAX_TEXT): string | undefined {
	return typeof v === "string" && v.trim() ? v.trim().slice(0, max) : undefined;
}

/** pack.json 내용에서 캐릭터 정보만 뽑는다 (이미지는 읽지 않음) */
export function characterFromManifest(m: unknown, fallbackId: string): CharacterInfo {
	const o = (m && typeof m === "object" ? m : {}) as Record<string, unknown>;
	return {
		id: text(o.id, 40) ?? fallbackId,
		name: text(o.name, 20) ?? fallbackId,
		persona: text(o.persona),
		speech: text(o.speech),
	};
}

/** 마지막 글자에 받침이 있으면 true (한글이 아니면 false) */
export function hasFinalConsonant(word: string): boolean {
	const c = word.trim().slice(-1).charCodeAt(0);
	if (c >= 0xac00 && c <= 0xd7a3) return (c - 0xac00) % 28 !== 0;
	return false;
}

/** 부르는 말: 잉키야, 하준아 */
export function vocative(name: string): string {
	return name + (hasFinalConsonant(name) ? "아" : "야");
}

/** 은/는, 이/가 같은 조사 */
export function josa(name: string, withFinal: string, withoutFinal: string): string {
	return name + (hasFinalConsonant(name) ? withFinal : withoutFinal);
}
