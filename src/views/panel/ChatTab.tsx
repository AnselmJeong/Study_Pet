import { useEffect, useRef, useState } from "react";
import { api } from "../common/rpc";
import { useChat } from "../common/useChat";
import { useCharacter } from "../common/useCharacter";
import { AttachStrip, CaptureButtons, useAttachments } from "../common/attachments";

export function ChatTab() {
	const { messages, busy } = useChat();
	const [text, setText] = useState("");
	const att = useAttachments({ from: "panel" });
	const character = useCharacter();
	useEffect(() => {
		document.title = `${character.name} · Inky`;
	}, [character.name]);
	const [search, setSearch] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [messages]);

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

	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
				{messages.length === 0 && (
					<p className="mt-10 text-center text-sm text-slate-400">
						아직 대화가 없어. {character.name}에게 화면이나 그림을 보여 주면서 물어봐.
					</p>
				)}
				{messages.map((m) => (
					<div key={m.id} className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
						<div
							className={`max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm leading-relaxed select-text ${
								m.role === "user"
									? "bg-indigo-600 text-white"
									: m.error
										? "bg-rose-50 text-rose-700 ring-1 ring-rose-200"
										: "bg-white text-slate-800 shadow-sm ring-1 ring-slate-200"
							}`}
						>
							{m.role === "assistant" && <div className="mb-0.5 text-[11px] font-semibold text-indigo-500">{character.name}</div>}
							{m.thumbs && m.thumbs.length > 0 && (
								<div className="mb-1 flex flex-wrap gap-1">
									{m.thumbs.map((t, i) => (
										<img key={i} src={t} className="h-14 max-w-[120px] rounded-md object-cover ring-1 ring-white/30" />
									))}
								</div>
							)}
							{m.text || (busy ? "…" : "")}
							{m.withScreen && <div className="mt-1 text-[11px] opacity-70">📷 화면 첨부됨</div>}
						</div>
					</div>
				))}
				<div ref={endRef} />
			</div>

			<div className="space-y-2 border-t border-slate-200 bg-white p-3">
				<AttachStrip a={att} />
				<textarea
					value={text}
					rows={3}
					placeholder="질문을 입력해 (Enter 보내기, Shift+Enter 줄바꿈, 이미지 붙여넣기·끌어놓기 OK)"
					onChange={(e) => setText(e.target.value)}
					onPaste={att.onPaste}
					onKeyDown={(e) => {
						if (e.nativeEvent.isComposing || e.keyCode === 229) return;
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void submit();
						}
					}}
					className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-indigo-400"
				/>
				<div className="flex items-center justify-between text-xs text-slate-500">
					<CaptureButtons a={att} />
					<label className="flex cursor-pointer items-center gap-1" title="답하기 전에 질문으로 웹 검색을 먼저 함 (꺼 둬도 필요하면 알아서 검색)">
						<input type="checkbox" checked={search} onChange={(e) => setSearch(e.target.checked)} />
						🔎 웹 검색
					</label>
					<div className="flex items-center gap-3">
						{hint && <span className="text-amber-600">{hint}</span>}
						<button onClick={() => api.clearHistory({})} className="hover:text-slate-800">
							대화 지우기
						</button>
						{busy ? (
							<button onClick={() => api.cancel({})} className="rounded-md bg-slate-200 px-3 py-1 text-slate-700">
								멈추기
							</button>
						) : (
							<button
								onClick={() => void submit()}
								disabled={att.working || (!text.trim() && !att.ids.length)}
								className="rounded-md bg-indigo-600 px-3 py-1 text-white disabled:opacity-40"
							>
								보내기
							</button>
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
