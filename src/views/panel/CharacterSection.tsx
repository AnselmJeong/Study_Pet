import { useEffect, useState } from "react";
import { INKY_ID, type PackInfo } from "../../shared/pack";
import { builtinPackInfos } from "../common/builtinPacks";
import { Inky } from "../common/Inky";
import { api, on } from "../common/rpc";

const INKY: PackInfo = { id: INKY_ID, name: "잉키", author: "기본", description: "잉크 방울 책갈피 요정", builtin: true };

/** 설정 > 캐릭터: 팩 고르기, 폴더에서 가져오기, 삭제 */
export function CharacterSection() {
	const [current, setCurrent] = useState<string>(INKY_ID);
	const [userPacks, setUserPacks] = useState<PackInfo[]>([]);
	const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
	const [busy, setBusy] = useState(false);
	// WebView에서 confirm()이 안 뜰 수 있어서 두 번 눌러 지운다
	const [armed, setArmed] = useState<string | null>(null);

	const refresh = () =>
		api
			.listPacks({})
			.then(setUserPacks)
			.catch(() => {});

	useEffect(() => {
		api.getSettings({}).then((s) => setCurrent(s.petPackId || INKY_ID));
		void refresh();
		return on("settingsChanged", (s) => setCurrent(s.petPackId || INKY_ID));
	}, []);

	const all = [INKY, ...builtinPackInfos(), ...userPacks];

	async function choose(id: string) {
		setCurrent(id);
		await api.setPetPack({ id });
	}

	async function importFolder() {
		setBusy(true);
		setMsg(null);
		try {
			const r = await api.importPack({});
			if (r.canceled) return;
			if (!r.ok || !r.info) {
				setMsg({ ok: false, text: r.error ?? "가져오지 못했어" });
				return;
			}
			await refresh();
			await choose(r.info.id);
			setMsg({ ok: true, text: `“${r.info.name}” 가져왔어${r.error ? ` (${r.error})` : ""}` });
		} finally {
			setBusy(false);
		}
	}

	async function remove(p: PackInfo) {
		if (armed !== p.id) {
			setArmed(p.id);
			setTimeout(() => setArmed((a) => (a === p.id ? null : a)), 3000);
			return;
		}
		setArmed(null);
		await api.removePack({ id: p.id });
		if (current === p.id) await choose(INKY_ID);
		await refresh();
	}

	return (
		<div className="space-y-3">
			<div className="grid grid-cols-3 gap-2">
				{all.map((p) => {
					const active = current === p.id;
					return (
						<div
							key={p.id}
							role="button"
							onClick={() => !p.error && void choose(p.id)}
							className={`group relative flex cursor-pointer flex-col items-center rounded-lg p-2 text-center ring-1 ${
								active ? "bg-indigo-50 ring-2 ring-indigo-400" : "bg-slate-50 ring-slate-200 hover:bg-slate-100"
							} ${p.error ? "cursor-not-allowed opacity-60" : ""}`}
							title={p.error ?? p.description ?? ""}
						>
							<div className="flex h-20 items-end justify-center">
								{p.id === INKY_ID ? (
									<Inky mood="idle" size={60} />
								) : p.preview ? (
									<img src={p.preview} className="max-h-20 max-w-full object-contain" draggable={false} />
								) : (
									<span className="text-2xl">?</span>
								)}
							</div>
							<div className="mt-1 w-full truncate text-xs font-medium text-slate-700">{p.name}</div>
							<div className="w-full truncate text-[10px] text-slate-400">{p.error ? "읽기 실패" : (p.author ?? (p.builtin ? "기본" : ""))}</div>
							{!p.builtin && (
								<button
									onClick={(e) => {
										e.stopPropagation();
										void remove(p);
									}}
									className={`absolute top-1 right-1 rounded bg-white/90 px-1 text-[10px] text-rose-600 ring-1 ring-rose-200 ${armed === p.id ? "block" : "hidden group-hover:block"}`}
								>
									{armed === p.id ? "정말?" : "삭제"}
								</button>
							)}
						</div>
					);
				})}
			</div>
			<div className="flex flex-wrap items-center gap-2">
				<button
					onClick={() => void importFolder()}
					disabled={busy}
					className="rounded-md bg-slate-800 px-3 py-1.5 text-xs text-white disabled:opacity-50"
				>
					{busy ? "가져오는 중…" : "폴더나 zip에서 가져오기"}
				</button>
				<button onClick={() => void api.openPacksFolder({})} className="rounded-md bg-slate-100 px-3 py-1.5 text-xs text-slate-700 ring-1 ring-slate-200">
					팩 폴더 열기
				</button>
			</div>
			{msg && <div className={`whitespace-pre-wrap text-xs ${msg.ok ? "text-emerald-700" : "text-rose-600"}`}>{msg.text}</div>}
			<p className="text-[11px] leading-relaxed text-slate-400">
				pack.json과 이미지가 든 폴더나 그 폴더를 압축한 .zip을 고르면 돼. idle 이미지 한 장만 있어도 되고, talk, think, sleep, read, wave 같은 상태 이미지를 넣으면 그때그때 바뀌어. 형식은 docs/CHARACTER_PACKS.md, 예제는 요미 팩을 참고해.
			</p>
		</div>
	);
}
