import { useEffect, useRef, useState } from "react";
import { api } from "../common/rpc";
import { useChat } from "../common/useChat";

export function ChatTab() {
	const { messages, busy } = useChat();
	const [text, setText] = useState("");
	const [attach, setAttach] = useState(true);
	const [search, setSearch] = useState(false);
	const [hint, setHint] = useState<string | null>(null);
	const endRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		api.getSettings({}).then((s) => setAttach(s.attachScreenByDefault)).catch(() => {});
	}, []);

	useEffect(() => {
		endRef.current?.scrollIntoView({ block: "end" });
	}, [messages]);

	async function submit() {
		const t = text.trim();
		if (!t) return;
		const res = await api.ask({ text: t, attachScreen: attach, webSearch: search });
		if (res.accepted) {
			setText("");
			setHint(null);
		} else setHint(res.reason ?? "지금은 보낼 수 없어");
	}

	return (
		<div className="flex h-full flex-col">
			<div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-4 py-4">
				{messages.length === 0 && (
					<p className="mt-10 text-center text-sm text-slate-400">
						아직 대화가 없어. 화면에 보이는 걸 물어보면 같이 볼게.
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
							{m.text || (busy ? "…" : "")}
							{m.withScreen && <div className="mt-1 text-[11px] opacity-70">📷 화면 첨부됨</div>}
						</div>
					</div>
				))}
				<div ref={endRef} />
			</div>

			<div className="border-t border-slate-200 bg-white p-3">
				<textarea
					value={text}
					rows={3}
					placeholder="질문을 입력해 (Enter 보내기, Shift+Enter 줄바꿈)"
					onChange={(e) => setText(e.target.value)}
					onKeyDown={(e) => {
						if (e.nativeEvent.isComposing || e.keyCode === 229) return;
						if (e.key === "Enter" && !e.shiftKey) {
							e.preventDefault();
							void submit();
						}
					}}
					className="w-full resize-none rounded-lg border border-slate-200 p-2 text-sm outline-none focus:border-indigo-400"
				/>
				<div className="mt-2 flex items-center justify-between text-xs text-slate-500">
					<label className="flex cursor-pointer items-center gap-1">
						<input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} />
						📷 현재 화면 같이 보내기
					</label>
					<label className="flex cursor-pointer items-center gap-1" title="답하기 전에 질문으로 웹 검색을 먼저 함 (꺼 둬도 잉키가 필요하면 알아서 검색)">
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
								disabled={!text.trim()}
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
