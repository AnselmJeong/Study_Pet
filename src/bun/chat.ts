// 대화 기록과 질문 처리. M0에서는 기록을 메모리에만 둔다 (M1에서 SQLite로 이동).

import type { ChatMessage, PetMood } from "../shared/types";
import { captureScreen, shotToDataUrl } from "./capture";
import { streamChat, type ContentPart, type OAIMessage } from "./llm/openaiCompat";
import { systemPrompt } from "./llm/prompt";
import { getSettings, resolveApiKey } from "./settings";

const MAX_HISTORY_TURNS = 12; // 모델에 보내는 과거 메시지 수 (이미지는 현재 질문에만 붙인다)

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

export async function ask(text: string, attachScreen: boolean, ev: ChatEvents) {
	const settings = getSettings();
	const provider = settings.provider;

	const userMsg: ChatMessage = { id: newId(), role: "user", text, ts: Date.now() };
	const botMsg: ChatMessage = { id: newId(), role: "assistant", text: "", ts: Date.now() };

	// 과거 대화(텍스트만)
	const past: OAIMessage[] = history
		.filter((m) => !m.error && m.text)
		.slice(-MAX_HISTORY_TURNS)
		.map((m) => ({ role: m.role, content: m.text }) as OAIMessage);

	history.push(userMsg);
	ev.messageAdded(userMsg);
	ev.mood("thinking");

	const fail = (msg: string) => {
		botMsg.text = msg;
		botMsg.error = true;
		history.push(botMsg);
		ev.messageAdded(botMsg);
		ev.messageDone(botMsg.id, msg, true);
		ev.mood("error");
		setTimeout(() => ev.mood("idle"), 4000);
	};

	if (!provider.baseUrl || !provider.model) {
		fail("아직 모델이 설정되지 않았어. 패널의 설정 탭에서 Base URL과 모델을 골라줘.");
		return;
	}

	// 화면 첨부
	let content: string | ContentPart[] = text;
	if (attachScreen && provider.vision) {
		const shot = await captureScreen();
		if (shot) {
			userMsg.withScreen = true;
			content = [
				{ type: "text", text: `[지금 내 화면 스크린샷이 첨부됨]\n${text}` },
				{ type: "image_url", image_url: { url: await shotToDataUrl(shot) } },
			];
		} else {
			content = `${text}\n\n(화면 캡처 권한이 없어 스크린샷 없이 질문함)`;
		}
	}

	const messages: OAIMessage[] = [
		{ role: "system", content: systemPrompt(settings, new Date()) },
		...past,
		{ role: "user", content },
	];

	history.push(botMsg);
	ev.messageAdded(botMsg);

	inflight = new AbortController();
	let started = false;
	try {
		const final = await streamChat({
			provider,
			apiKey: resolveApiKey(provider),
			messages,
			signal: inflight.signal,
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
		setTimeout(() => ev.mood("idle"), 2500);
	} catch (err) {
		const aborted = inflight?.signal.aborted;
		botMsg.error = !aborted;
		botMsg.text = aborted ? botMsg.text + " (중단됨)" : `앗, 답을 못 받았어: ${String(err).slice(0, 200)}`;
		ev.messageDone(botMsg.id, botMsg.text, botMsg.error);
		ev.mood(aborted ? "idle" : "error");
		if (!aborted) setTimeout(() => ev.mood("idle"), 4000);
	} finally {
		inflight = null;
	}
}
