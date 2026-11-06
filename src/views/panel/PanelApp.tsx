import { useEffect, useState } from "react";
import { on } from "../common/rpc";
import { ChatTab } from "./ChatTab";
import { SettingsTab } from "./SettingsTab";
import { TimelineTab } from "./TimelineTab";

type Tab = "chat" | "timeline" | "settings";

function tabFromHash(): Tab {
	const h = location.hash.slice(1);
	return h === "settings" || h === "timeline" ? h : "chat";
}

export function PanelApp() {
	const [tab, setTab] = useState<Tab>(tabFromHash());

	useEffect(() => on("showTab", ({ tab }) => setTab(tab)), []);

	return (
		<div className="flex h-screen flex-col font-sans text-slate-800">
			{/* hiddenInset 타이틀바 영역: 드래그로 창 이동 */}
			<div className="electrobun-webkit-app-region-drag flex h-11 shrink-0 items-end gap-1 border-b border-slate-200 bg-white px-3 pl-20">
				{(
					[
						["chat", "대화"],
						["timeline", "화면 기록"],
						["settings", "설정"],
					] as const
				).map(([id, label]) => (
					<button
						key={id}
						onClick={() => setTab(id)}
						className={`rounded-t-md px-3 py-1.5 text-sm ${
							tab === id ? "bg-slate-100 font-semibold text-indigo-700" : "text-slate-500 hover:text-slate-800"
						}`}
					>
						{label}
					</button>
				))}
			</div>
			<div className="min-h-0 flex-1">{tab === "chat" ? <ChatTab /> : tab === "timeline" ? <TimelineTab /> : <SettingsTab />}</div>
		</div>
	);
}
