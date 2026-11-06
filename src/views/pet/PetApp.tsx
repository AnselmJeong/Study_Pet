import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { CaptureState, PetAction, PetMood } from "../../shared/types";
import { PetCharacter } from "../common/PetCharacter";
import { api, on } from "../common/rpc";
import { useChat } from "../common/useChat";
import { useCharacter } from "../common/useCharacter";
import { AttachStrip, CaptureButtons, useAttachments } from "../common/attachments";

const BUBBLE_HIDE_MS = 15_000;
const PAD = 8;

/** 가만히 있을 때 고를 행동과 가중치 */
function pickAction(mood: PetMood, running: boolean): PetAction {
	const hour = new Date().getHours();
	const late = hour >= 23 || hour < 5;
	const table: [PetAction, number][] = running
		? [
				["read", 5],
				["lookAround", 2],
				["stretch", 1],
				["hop", 1],
				["walk", 1],
			]
		: [
				["lookAround", 3],
				["hop", 2],
				["walk", 3],
				["stretch", 2],
				["wave", 2],
				["spin", 1],
				["read", 2],
				["doze", late ? 6 : 1],
			];
	if (mood !== "idle" && mood !== "focus") return "none";
	const total = table.reduce((a, [, w]) => a + w, 0);
	let r = Math.random() * total;
	for (const [a, w] of table) {
		if ((r -= w) <= 0) return a;
	}
	return "none";
}

const ACTION_MS: Record<PetAction, number> = {
	none: 0,
	hop: 1500,
	lookAround: 2500,
	stretch: 1900,
	read: 14000,
	wave: 1700,
	doze: 20000,
	spin: 1000,
	walk: 2600,
};

export function PetApp() {
	const { messages, busy } = useChat();
	const [mood, setMood] = useState<PetMood>("idle");
	const [action, setAction] = useState<PetAction>("none");
	const [inputOpen, setInputOpen] = useState(false);
	const [text, setText] = useState("");
	const [search, setSearch] = useState(false);
	const [bubbleVisible, setBubbleVisible] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const [hovering, setHovering] = useState(false);
	const [capture, setCapture] = useState<CaptureState>({ running: false, paused: false, goal: "", startedAt: null, lastCaptureAt: null });
	const [goalDraft, setGoalDraft] = useState("");

	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const down = useRef({ x: 0, y: 0 });
	const walkDir = useRef<1 | -1>(-1);

	const openInput = () => {
		setInputOpen(true);
		setTimeout(() => inputRef.current?.focus(), 30);
	};
	const att = useAttachments({ from: "pet", onIncoming: openInput });
	const character = useCharacter();

	const last = [...messages].reverse().find((m) => m.role === "assistant");

	useEffect(() => {
		api.getCaptureState({}).then(setCapture).catch(() => {});
		const offs = [
			on("mood", ({ mood }) => setMood(mood)),
			on("focusInput", () => {
				setInputOpen(true);
				setTimeout(() => inputRef.current?.focus(), 30);
			}),
			on("messageAdded", (m) => {
				if (m.role === "assistant") {
					setBubbleVisible(true);
					setAction("none");
				}
			}),
			on("petSays", ({ kind }) => setAction(kind === "joke" ? "spin" : kind === "break" ? "stretch" : "wave")),
			on("captureState", setCapture),
		];
		return () => offs.forEach((off) => off());
	}, []);

	// 가만히 있을 때 8~20초마다 행동 하나
	useEffect(() => {
		if (busy || inputOpen) return;
		let cancelled = false;
		let t: ReturnType<typeof setTimeout>;
		const loop = () => {
			t = setTimeout(async () => {
				if (cancelled) return;
				const a = pickAction(mood, capture.running);
				setAction(a);
				if (a === "walk") {
					// 화면 가장자리에 닿으면 방향을 바꾼다
					const dx = walkDir.current * (40 + Math.random() * 80);
					walkDir.current = Math.random() < 0.5 ? 1 : -1;
					void api.walkPet({ dx, durationMs: ACTION_MS.walk }).catch(() => {});
				}
				setTimeout(() => !cancelled && setAction("none"), ACTION_MS[a]);
				loop();
			}, 8000 + Math.random() * 12000);
		};
		loop();
		return () => {
			cancelled = true;
			clearTimeout(t);
		};
	}, [busy, inputOpen, mood, capture.running]);

	useEffect(() => {
		if (!bubbleVisible || busy || hovering) return;
		const t = setTimeout(() => setBubbleVisible(false), BUBBLE_HIDE_MS);
		return () => clearTimeout(t);
	}, [bubbleVisible, busy, hovering, last?.text]);

	useLayoutEffect(() => {
		const el = rootRef.current;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			const r = el.getBoundingClientRect();
			api.resizePet({ width: r.width + PAD * 2, height: r.height + PAD * 2 }).catch(() => {});
		});
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	async function submit() {
		const t = text.trim();
		if (!t && !att.ids.length) return;
		const res = await api.ask({ text: t, attachments: att.ids, webSearch: search });
		if (res.accepted) {
			setText("");
			setHint(null);
			att.sent();
		} else setHint(res.reason ?? "지금은 보낼 수 없어");
	}

	async function toggleSession() {
		if (capture.running) setCapture(await api.stopCapture({}));
		else {
			setCapture(await api.startCapture({ goal: goalDraft }));
			setGoalDraft("");
		}
	}

	function onPetMouseUp(e: React.MouseEvent) {
		const dx = e.screenX - down.current.x;
		const dy = e.screenY - down.current.y;
		if (dx * dx + dy * dy < 25) {
			setAction("hop");
			setTimeout(() => setAction("none"), ACTION_MS.hop);
			setInputOpen((v) => {
				const next = !v;
				if (next) setTimeout(() => inputRef.current?.focus(), 30);
				return next;
			});
			if (last) setBubbleVisible(true);
		}
	}

	const minutes = capture.startedAt ? Math.floor((Date.now() - capture.startedAt) / 60_000) : 0;

	return (
		<div className="fixed right-0 bottom-0 p-2">
			<div
				ref={rootRef}
				className="flex w-max flex-col items-end gap-2"
				onMouseEnter={() => setHovering(true)}
				onMouseLeave={() => setHovering(false)}
			>
				{bubbleVisible && last && (
					<div className="relative w-[380px] rounded-2xl bg-white/95 px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-lg ring-1 ring-black/10 select-text">
						<div className="max-h-[300px] overflow-y-auto whitespace-pre-wrap break-words pr-1">
							{last.text || (busy ? "…" : "")}
						</div>
						<div className="mt-1 flex justify-end gap-3 text-[11px] text-slate-500">
							{busy && (
								<button className="hover:text-slate-800" onClick={() => api.cancel({})}>
									멈추기
								</button>
							)}
							<button
								className="hover:text-slate-800"
								onClick={() => {
									setInputOpen(true);
									setTimeout(() => inputRef.current?.focus(), 30);
								}}
							>
								대답하기
							</button>
							<button className="hover:text-slate-800" onClick={() => api.openPanel({ tab: "chat" })}>
								패널
							</button>
							<button className="hover:text-slate-800" onClick={() => setBubbleVisible(false)}>
								닫기
							</button>
						</div>
						<div className="absolute -bottom-1.5 right-12 h-3 w-3 rotate-45 bg-white/95" />
					</div>
				)}

				{inputOpen && (
					<div className="w-[300px] space-y-2 rounded-2xl bg-slate-900/90 p-2 shadow-xl ring-1 ring-white/10">
						<div className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1 text-[11px] text-slate-300">
							{capture.running ? (
								<>
									<span className="text-rose-400">●</span>
									<span className="min-w-0 flex-1 truncate">
										공부 중 {minutes}분{capture.goal ? ` · ${capture.goal}` : ""}
									</span>
								</>
							) : (
								<input
									value={goalDraft}
									onChange={(e) => setGoalDraft(e.target.value)}
									placeholder="오늘 목표 (선택)"
									className="min-w-0 flex-1 bg-transparent text-white placeholder:text-slate-500 outline-none"
								/>
							)}
							<button
								onClick={() => void toggleSession()}
								className={`shrink-0 rounded-full px-2 py-0.5 ${capture.running ? "bg-slate-700" : "bg-emerald-600 text-white"}`}
								title="공부 세션 동안 1분마다 화면을 기록하고 요약해"
							>
								{capture.running ? "끝내기" : "공부 시작"}
							</button>
						</div>
						<textarea
							ref={inputRef}
							value={text}
							rows={2}
							placeholder={`${character.name}에게 물어봐… (이미지 붙여넣기·끌어놓기 OK)`}
							onChange={(e) => setText(e.target.value)}
							onPaste={att.onPaste}
							onKeyDown={(e) => {
								if (e.nativeEvent.isComposing || e.keyCode === 229) return;
								if (e.key === "Enter" && !e.shiftKey) {
									e.preventDefault();
									void submit();
								} else if (e.key === "Escape") {
									setInputOpen(false);
								}
							}}
							className="w-full resize-none bg-transparent text-[13px] text-white placeholder:text-slate-400 outline-none"
						/>
						<AttachStrip a={att} dark />
						{hint && <div className="text-[11px] text-amber-300">{hint}</div>}
						<div className="flex items-center justify-between text-[11px] text-slate-300">
							<CaptureButtons a={att} dark />
							<label className="flex cursor-pointer items-center gap-1" title="답하기 전에 웹 검색을 먼저 함 (꺼 둬도 필요하면 알아서 검색)">
								<input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
								🔎
							</label>
							<div className="flex items-center gap-2">
								<button onClick={() => api.openPanel({ tab: "timeline" })} className="text-slate-400 hover:text-white" title="화면 기록">
									🕘
								</button>
								<button onClick={() => api.openPanel({ tab: "settings" })} className="text-slate-400 hover:text-white" title="설정">
									⚙︎
								</button>
								<button
									onClick={() => void submit()}
									disabled={busy || att.working || (!text.trim() && !att.ids.length)}
									className="rounded-full bg-indigo-500 px-3 py-0.5 text-white disabled:opacity-40"
								>
									보내기
								</button>
							</div>
						</div>
					</div>
				)}

				<div
					className="electrobun-webkit-app-region-drag relative cursor-pointer"
					onMouseDown={(e) => (down.current = { x: e.screenX, y: e.screenY })}
					onMouseUp={onPetMouseUp}
					title="클릭: 물어보기 · 드래그: 이동"
				>
					<PetCharacter mood={mood} action={action} size={110} />
				</div>
			</div>
		</div>
	);
}
