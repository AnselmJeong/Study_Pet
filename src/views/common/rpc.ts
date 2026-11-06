// WebView 쪽 RPC 클라이언트. Bun에서 오는 메시지를 간단한 이벤트로 바꿔서 React가 구독한다.

import Electrobun, { Electroview } from "electrobun/view";
import type { StudyPetRPC } from "../../shared/rpc";

type Msgs = StudyPetRPC["webview"]["messages"];
type Listener<K extends keyof Msgs> = (payload: Msgs[K]) => void;

const listeners = new Map<keyof Msgs, Set<(payload: unknown) => void>>();

function emit<K extends keyof Msgs>(name: K, payload: Msgs[K]) {
	listeners.get(name)?.forEach((fn) => fn(payload));
}

export function on<K extends keyof Msgs>(name: K, fn: Listener<K>): () => void {
	let set = listeners.get(name);
	if (!set) listeners.set(name, (set = new Set()));
	const f = fn as (payload: unknown) => void;
	set.add(f);
	return () => {
		set.delete(f);
	};
}

const rpc = Electroview.defineRPC<StudyPetRPC>({
	maxRequestTime: 120_000,
	handlers: {
		requests: {},
		messages: {
			messageAdded: (p) => emit("messageAdded", p),
			messageDelta: (p) => emit("messageDelta", p),
			messageDone: (p) => emit("messageDone", p),
			historyCleared: (p) => emit("historyCleared", p),
			mood: (p) => emit("mood", p),
			focusInput: (p) => emit("focusInput", p),
			attachmentAdded: (p) => emit("attachmentAdded", p),
			attachmentError: (p) => emit("attachmentError", p),
			showTab: (p) => emit("showTab", p),
			settingsChanged: (p) => emit("settingsChanged", p),
			characterChanged: (p) => emit("characterChanged", p),
			captureState: (p) => emit("captureState", p),
			timelineAdded: (p) => emit("timelineAdded", p),
			petSays: (p) => emit("petSays", p),
		},
	},
});

const electrobun = new Electrobun.Electroview({ rpc });

export const api = electrobun.rpc!.request;

/** WebView 기본 우클릭 메뉴(새로 고침, 요소 검사)를 막고 앱 메뉴를 띄운다 */
export function installContextMenu(where: "pet" | "panel") {
	window.addEventListener("contextmenu", (e) => {
		e.preventDefault();
		const t = e.target as HTMLElement | null;
		const editable = Boolean(t?.closest?.("input, textarea, [contenteditable=''], [contenteditable='true']"));
		const hasSelection = Boolean(window.getSelection()?.toString());
		void api.showContextMenu({ where, editable, hasSelection }).catch(() => {});
	});
}
