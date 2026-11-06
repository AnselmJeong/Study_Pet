import { useEffect, useState } from "react";
import { INKY_ID, type ResolvedPack, pickState, stateFor } from "../../shared/pack";
import type { PetAction, PetMood } from "../../shared/types";
import { builtinPack } from "./builtinPacks";
import { Inky } from "./Inky";
import { api, on } from "./rpc";

/** 설정에서 고른 캐릭터 팩을 불러온다. null이면 기본 잉키 */
export function usePetPack(): ResolvedPack | null {
	const [id, setId] = useState<string>(INKY_ID);
	const [pack, setPack] = useState<ResolvedPack | null>(null);

	useEffect(() => {
		api.getSettings({}).then((s) => setId(s.petPackId || INKY_ID)).catch(() => {});
		return on("settingsChanged", (s) => setId(s.petPackId || INKY_ID));
	}, []);

	useEffect(() => {
		let alive = true;
		if (id === INKY_ID) setPack(null);
		else {
			const b = builtinPack(id);
			if (b) setPack(b);
			else
				api
					.getPack({ id })
					.then((r) => alive && setPack(r.pack))
					.catch(() => alive && setPack(null));
		}
		return () => {
			alive = false;
		};
	}, [id]);

	return pack;
}

/** 프레임 애니메이션 하나 재생. 상태가 바뀌면 처음부터 */
function useFrame(durations: number[], loop: boolean, key: string): number {
	const [i, setI] = useState(0);
	useEffect(() => setI(0), [key]);
	useEffect(() => {
		if (durations.length <= 1) return;
		if (!loop && i >= durations.length - 1) return;
		const t = setTimeout(() => setI((x) => (x + 1) % durations.length), durations[i % durations.length]);
		return () => clearTimeout(t);
	}, [i, durations, loop]);
	return i % Math.max(1, durations.length);
}

export function PackSprite({ pack, mood, action }: { pack: ResolvedPack; mood: PetMood; action: PetAction }) {
	const { name, state } = pickState(pack, stateFor(mood, action));
	const frame = useFrame(state.durations, state.loop, `${pack.id}:${name}`);
	const h = pack.height;
	// motion이 켜져 있으면 숨쉬기, 통통 튀기 같은 앱 움직임을 이미지 전체에 덧입힌다
	const motionCls = pack.motion ? `pack pack-mood-${mood} pack-act-${action}` : "";

	let img: React.ReactNode;
	if (state.sheet) {
		const { columns, rows } = state.sheet;
		const col = frame % columns;
		const row = Math.floor(frame / columns) % rows;
		img = <SheetFrame url={state.frames[0]} columns={columns} rows={rows} col={col} row={row} height={h} />;
	} else {
		img = <img src={state.frames[frame] ?? state.frames[0]} style={{ height: h, width: "auto", display: "block" }} draggable={false} alt={pack.name} />;
	}

	return (
		<div className={motionCls} style={{ minWidth: 80 }}>
			<div className="pack-body">
				{img}
			</div>
		</div>
	);
}

/** 스프라이트 시트에서 한 칸만 보여 준다. 칸 비율은 이미지 크기에서 계산 */
function SheetFrame({ url, columns, rows, col, row, height }: { url: string; columns: number; rows: number; col: number; row: number; height: number }) {
	const [ratio, setRatio] = useState(1);
	useEffect(() => {
		const im = new Image();
		im.onload = () => setRatio(im.naturalWidth / columns / (im.naturalHeight / rows) || 1);
		im.src = url;
	}, [url, columns, rows]);
	const w = Math.round(height * ratio);
	return (
		<div
			style={{
				width: w,
				height,
				backgroundImage: `url("${url}")`,
				backgroundSize: `${columns * 100}% ${rows * 100}%`,
				backgroundPosition: `${columns > 1 ? (col / (columns - 1)) * 100 : 0}% ${rows > 1 ? (row / (rows - 1)) * 100 : 0}%`,
				backgroundRepeat: "no-repeat",
			}}
		/>
	);
}

/** 펫 창에서 쓰는 캐릭터: 팩이 있으면 팩, 없으면 잉키 */
export function PetCharacter({ mood, action, size = 110 }: { mood: PetMood; action: PetAction; size?: number }) {
	const pack = usePetPack();
	if (!pack) return <Inky mood={mood} action={action} size={size} />;
	return <PackSprite pack={pack} mood={mood} action={action} />;
}
