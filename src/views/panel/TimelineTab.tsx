import { useEffect, useState } from "react";
import type { CaptureState, TimelineEntry } from "../../shared/types";
import { api, on } from "../common/rpc";

const REL_STYLE: Record<string, string> = {
	on_task: "bg-emerald-100 text-emerald-800",
	related: "bg-sky-100 text-sky-800",
	off_task: "bg-amber-100 text-amber-800",
	break: "bg-slate-100 text-slate-600",
	unknown: "bg-slate-100 text-slate-500",
};
const REL_LABEL: Record<string, string> = {
	on_task: "공부",
	related: "관련",
	off_task: "딴짓",
	break: "휴식",
	unknown: "?",
};

export function TimelineTab() {
	const [entries, setEntries] = useState<TimelineEntry[]>([]);
	const [cs, setCs] = useState<CaptureState | null>(null);
	const [goal, setGoal] = useState("");

	useEffect(() => {
		api.getTimeline({}).then(setEntries).catch(console.error);
		api.getCaptureState({}).then(setCs).catch(() => {});
		const offs = [on("timelineAdded", (e) => setEntries((p) => [...p, e])), on("captureState", setCs)];
		return () => offs.forEach((o) => o());
	}, []);

	const list = [...entries].reverse().slice(0, 200);
	const today = entries.filter((e) => new Date(e.ts).toDateString() === new Date().toDateString() && !e.skipped);
	const onTask = today.filter((e) => e.relevance === "on_task" || e.relevance === "related").length;

	return (
		<div className="flex h-full flex-col">
			<div className="space-y-2 border-b border-slate-200 bg-white p-3 text-sm">
				<div className="flex items-center gap-2">
					{cs?.running ? (
						<>
							<span className="text-rose-500">●</span>
							<span className="min-w-0 flex-1 truncate">
								기록 중 · {cs.goal || "목표 없음"}
							</span>
							<button onClick={async () => setCs(await api.stopCapture({}))} className="rounded-md bg-slate-200 px-3 py-1 text-xs">
								세션 끝내기
							</button>
						</>
					) : (
						<>
							<input
								value={goal}
								onChange={(e) => setGoal(e.target.value)}
								placeholder="오늘 목표 (선택)"
								className="min-w-0 flex-1 rounded-md border border-slate-200 px-2 py-1 text-xs"
							/>
							<button
								onClick={async () => {
									setCs(await api.startCapture({ goal }));
									setGoal("");
								}}
								className="rounded-md bg-emerald-600 px-3 py-1 text-xs text-white"
							>
								공부 시작
							</button>
						</>
					)}
				</div>
				<p className="text-xs text-slate-500">
					오늘 기록 {today.length}분 중 공부·관련 {onTask}분. 스크린샷은 설정한 시간이 지나면 지워지고 요약만 남아.
				</p>
			</div>
			<div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto p-3">
				{list.length === 0 && <p className="mt-10 text-center text-sm text-slate-400">아직 기록이 없어. "공부 시작"을 누르면 1분마다 기록해.</p>}
				{list.map((e) => (
					<div key={e.id} className="flex gap-2 rounded-lg bg-white p-2 text-xs shadow-sm ring-1 ring-slate-100">
						<span className="w-11 shrink-0 font-mono text-slate-400">
							{new Date(e.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}
						</span>
						<span className={`h-fit shrink-0 rounded px-1.5 py-0.5 ${REL_STYLE[e.relevance] ?? REL_STYLE.unknown}`}>
							{REL_LABEL[e.relevance] ?? "?"}
						</span>
						<div className="min-w-0 flex-1">
							<div className={e.skipped || e.error ? "text-slate-400" : "text-slate-700"}>{e.summary}</div>
							{e.app && <div className="text-[10px] text-slate-400">{e.app}</div>}
							{e.error && <div className="text-[10px] text-rose-500">{e.error}</div>}
						</div>
					</div>
				))}
			</div>
		</div>
	);
}
