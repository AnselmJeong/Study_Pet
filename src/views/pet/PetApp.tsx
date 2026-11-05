import { useEffect, useLayoutEffect, useRef, useState } from "react";
import type { PetMood } from "../../shared/types";
import { Inky } from "../common/Inky";
import { api, on } from "../common/rpc";
import { useChat } from "../common/useChat";

const BUBBLE_HIDE_MS = 15_000;
const PAD = 8;

export function PetApp() {
	const { messages, busy } = useChat();
	const [mood, setMood] = useState<PetMood>("idle");
	const [inputOpen, setInputOpen] = useState(false);
	const [text, setText] = useState("");
	const [attach, setAttach] = useState(true);
	const [bubbleVisible, setBubbleVisible] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const [hovering, setHovering] = useState(false);

	const rootRef = useRef<HTMLDivElement>(null);
	const inputRef = useRef<HTMLTextAreaElement>(null);
	const down = useRef({ x: 0, y: 0 });

	const last = [...messages].reverse().find((m) => m.role === "assistant");

	// 설정의 기본 화면 첨부 여부
	useEffect(() => {
		api.getSettings({}).then((s) => setAttach(s.attachScreenByDefault)).catch(() => {});
		const offs = [
			on("mood", ({ mood }) => setMood(mood)),
			on("focusInput", () => {
				setInputOpen(true);
				setTimeout(() => inputRef.current?.focus(), 30);
			}),
			on("settingsChanged", (s) => setAttach(s.attachScreenByDefault)),
			on("messageAdded", (m) => {
				if (m.role === "assistant") setBubbleVisible(true);
			}),
		];
		return () => offs.forEach((off) => off());
	}, []);

	// 답이 끝나고 일정 시간이 지나면 말풍선 숨김 (마우스를 올려두면 유지)
	useEffect(() => {
		if (!bubbleVisible || busy || hovering) return;
		const t = setTimeout(() => setBubbleVisible(false), BUBBLE_HIDE_MS);
		return () => clearTimeout(t);
	}, [bubbleVisible, busy, hovering, last?.text]);

	// 내용 크기에 맞춰 창 크기 조절 (오른쪽 아래 고정)
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
		if (!t) return;
		const res = await api.ask({ text: t, attachScreen: attach });
		if (res.accepted) {
			setText("");
			setHint(null);
		} else {
			setHint(res.reason ?? "지금은 보낼 수 없어");
		}
	}

	function onPetMouseUp(e: React.MouseEvent) {
		const dx = e.screenX - down.current.x;
		const dy = e.screenY - down.current.y;
		if (dx * dx + dy * dy < 25) {
			// 클릭 (드래그가 아님)
			setInputOpen((v) => {
				const next = !v;
				if (next) setTimeout(() => inputRef.current?.focus(), 30);
				return next;
			});
			if (last) setBubbleVisible(true);
		}
	}

	return (
		<div className="fixed right-0 bottom-0 p-2">
			<div
				ref={rootRef}
				className="flex flex-col items-end gap-2"
				onMouseEnter={() => setHovering(true)}
				onMouseLeave={() => setHovering(false)}
			>
				{bubbleVisible && last && (
					<div className="relative max-w-[300px] rounded-2xl bg-white/95 px-3 py-2 text-[13px] leading-relaxed text-slate-800 shadow-lg ring-1 ring-black/10 select-text">
						<div className="max-h-[220px] overflow-y-auto whitespace-pre-wrap break-words pr-1">
							{last.text || (busy ? "…" : "")}
						</div>
						<div className="mt-1 flex justify-end gap-3 text-[11px] text-slate-500">
							{busy && (
								<button className="hover:text-slate-800" onClick={() => api.cancel({})}>
									멈추기
								</button>
							)}
							<button className="hover:text-slate-800" onClick={() => api.openPanel({ tab: "chat" })}>
								패널에서 보기
							</button>
							<button className="hover:text-slate-800" onClick={() => setBubbleVisible(false)}>
								닫기
							</button>
						</div>
						<div className="absolute -bottom-1.5 right-12 h-3 w-3 rotate-45 bg-white/95" />
					</div>
				)}

				{inputOpen && (
					<div className="w-[300px] rounded-2xl bg-slate-900/90 p-2 shadow-xl ring-1 ring-white/10">
						<textarea
							ref={inputRef}
							value={text}
							rows={2}
							placeholder="잉키에게 물어봐… (Enter 보내기, Esc 닫기)"
							onChange={(e) => setText(e.target.value)}
							onKeyDown={(e) => {
								// 한글 조합 중 Enter는 무시
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
						<div className="flex items-center justify-between text-[11px] text-slate-300">
							<label className="flex cursor-pointer items-center gap-1" title="질문할 때 현재 화면을 캡처해서 함께 보냄">
								<input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
								📷 화면 같이 보내기
							</label>
							<div className="flex items-center gap-2">
								{hint && <span className="text-amber-300">{hint}</span>}
								<button
									onClick={() => api.openPanel({ tab: "settings" })}
									className="text-slate-400 hover:text-white"
									title="설정"
								>
									⚙︎
								</button>
								<button
									onClick={() => void submit()}
									disabled={busy || !text.trim()}
									className="rounded-full bg-indigo-500 px-3 py-0.5 text-white disabled:opacity-40"
								>
									보내기
								</button>
							</div>
						</div>
					</div>
				)}

				<div
					className="electrobun-webkit-app-region-drag cursor-pointer"
					onMouseDown={(e) => (down.current = { x: e.screenX, y: e.screenY })}
					onMouseUp={onPetMouseUp}
					title="클릭: 물어보기 · 드래그: 이동"
				>
					<Inky mood={mood} size={110} />
				</div>
			</div>
		</div>
	);
}
