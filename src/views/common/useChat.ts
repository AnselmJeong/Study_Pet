import { useEffect, useState } from "react";
import type { ChatMessage } from "../../shared/types";
import { api, on } from "./rpc";

/** Bun이 가진 대화 기록을 구독한다 (펫/패널 공용) */
export function useChat() {
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const [busy, setBusy] = useState(false);

	useEffect(() => {
		api.getHistory({}).then(setMessages).catch(console.error);
		const offs = [
			on("messageAdded", (m) => {
				setMessages((prev) => [...prev, m]);
				if (m.role === "user") setBusy(true);
			}),
			on("messageDelta", ({ id, delta }) =>
				setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text: m.text + delta } : m))),
			),
			on("messageDone", ({ id, text, error }) => {
				setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, text, error } : m)));
				setBusy(false);
			}),
			on("historyCleared", () => setMessages([])),
		];
		return () => offs.forEach((off) => off());
	}, []);

	return { messages, busy };
}
