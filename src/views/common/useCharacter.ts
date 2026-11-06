import { useEffect, useState } from "react";
import { type CharacterInfo, INKY_CHARACTER } from "../../shared/character";
import { api, on } from "./rpc";

/** 지금 고른 캐릭터 (이름이 바뀌면 바로 다시 그린다) */
export function useCharacter(): CharacterInfo {
	const [c, setC] = useState<CharacterInfo>(INKY_CHARACTER);
	useEffect(() => {
		api.getCharacter({}).then(setC).catch(() => {});
		return on("characterChanged", setC);
	}, []);
	return c;
}
