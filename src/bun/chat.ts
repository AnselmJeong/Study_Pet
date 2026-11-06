// 대화 기록과 질문 처리. 기록은 메모리에만 둔다.
// 질문할 때 최근 20개 화면 요약(텍스트)과, 원하면 현재 화면 1장을 함께 보낸다.

import type { ChatMessage, PetMood } from "../shared/types";
import { captureScreen } from "./capture";
import * as context from "./context";
import { systemPrompt } from "./llm/prompt";
import { complete, supportsVision } from "./llm/router";
import type { HistoryTurn } from "./llm/types";
import { formatResults, searchKey, tinyfishSearch, webSearchTool } from "./search";
import { getSettings } from "./settings";

const MAX_HISTORY_TURNS = 12;

export type ChatEvents = {
	messageAdded: (m: ChatMessage) => void;
	messageDelta: (id: string, delta: string) => void;
	messageDone: (id: string, text: string, error?: boolean) => void;
	mood: (m: PetMood) => void;
};

const history: ChatMessage[] = [];
let inflight: AbortController | null = null;

function newId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

export function getHistory(): ChatMessage[] {
	return history;
}

export function clearHistory() {
	history.length = 0;
}

export function cancel(): boolean {
	if (!inflight) return false;
	inflight.abort();
	return true;
}

export function isBusy() {
	return inflight !== null;
}

/** 펫이 먼저 건넨 말도 대화 기록에 남겨서, 사용자가 이어서 대답할 수 있게 한다 */
export function addPetLine(text: string, ev: ChatEvents) {
	const m: ChatMessage = { id: newId(), role: "assistant", text, ts: Date.now() };
	history.push(m);
	ev.messageAdded(m);
	ev.messageDone(m.id, text);
}

export async function ask(text: string, attachScreen: boolean, ev: ChatEvents, forceSearch = false) {
	const settings = getSettings();
	const userMsg: ChatMessage = { id: newId(), role: "user", text, ts: Date.now() };
	const botMsg: ChatMessage = { id: newId(), role: "assistant", text: "", ts: Date.now() };

	const past: HistoryTurn[] = history
		.filter((m) => !m.error && m.text)
		.slice(-MAX_HISTORY_TURNS)
		.map((m) => ({ role: m.role, text: m.text }));

	inflight = new AbortController();
	history.push(userMsg);
	ev.messageAdded(userMsg);
	ev.mood("thinking");

	const images: string[] = [];
	let note = "";
	if (attachScreen && supportsVision("chat", settings)) {
		const shot = await captureScreen();
		if (shot) {
			images.push(shot.path);
			userMsg.withScreen = true;
		} else note = "\n\n(화면 캡처 권한이 없어 스크린샷 없이 질문함)";
	}

	// 웹 검색: 🔎를 켜고 물으면 먼저 검색해서 붙이고, 아니면 모델이 필요할 때 도구로 부른다
	const key = searchKey();
	let searchBlock = "";
	if (forceSearch) {
		if (!key) note += "\n\n(웹 검색을 하려면 설정에서 TinyFish API 키를 넣어 줘야 함)";
		else {
			try {
				searchBlock = formatResults(text, await tinyfishSearch(text.slice(0, 300), key, { signal: inflight.signal }));
				userMsg.searched = true;
			} catch (err) {
				note += `\n\n(${String(err).slice(0, 150)})`;
			}
		}
	}
	const tools = key && !searchBlock ? [webSearchTool(key, () => (userMsg.searched = true))] : undefined;

	const cs = context.getState();
	const timeline = context.recentSummaries(20);
	const userText = [
		cs.goal ? `[세션 목표] ${cs.goal}` : "",
		timeline ? `[최근 화면 기록]\n${timeline}` : "",
		images.length ? "[지금 화면 스크린샷이 첨부됨]" : "",
		searchBlock ? `[웹 검색 결과]\n${searchBlock}` : "",
		`[질문]\n${text}${note}`,
	]
		.filter(Boolean)
		.join("\n\n");

	history.push(botMsg);
	ev.messageAdded(botMsg);

	let started = false;
	const signal = inflight.signal;
	try {
		const final = await complete("chat", {
			system: systemPrompt(settings, new Date()),
			history: past,
			userText,
			images,
			signal,
			tools,
			onDelta: (d) => {
				if (!started) {
					started = true;
					ev.mood("talking");
				}
				botMsg.text += d;
				ev.messageDelta(botMsg.id, d);
			},
		});
		botMsg.text = final || botMsg.text || "(빈 응답)";
		ev.messageDone(botMsg.id, botMsg.text);
		ev.mood("happy");
		setTimeout(() => ev.mood(cs.running ? "focus" : "idle"), 2500);
	} catch (err) {
		const aborted = signal.aborted;
		botMsg.error = !aborted;
		botMsg.text = aborted ? botMsg.text + " (중단됨)" : `앗, 답을 못 받았어: ${String(err).slice(0, 300)}`;
		ev.messageDone(botMsg.id, botMsg.text, botMsg.error);
		ev.mood(aborted ? "idle" : "error");
		if (!aborted) setTimeout(() => ev.mood("idle"), 4000);
	} finally {
		inflight = null;
	}
}
