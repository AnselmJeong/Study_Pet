// 역할(대화 / 화면 요약)별로 설정된 제공자와 모델을 골라 호출한다.

import type { AppSettings, ProviderId } from "../../shared/types";
import { claudeApiKey, getSettings, openaiApiKey } from "../settings";
import { claudeComplete } from "./claudeSub";
import { openaiComplete } from "./openaiCompat";
import type { CompleteRequest } from "./types";

export type Role = "chat" | "summary";

export function providerFor(role: Role, s: AppSettings = getSettings()): ProviderId {
	return role === "chat" ? s.chatProvider : s.summaryProvider;
}

export function modelFor(role: Role, s: AppSettings = getSettings()): string {
	const p = providerFor(role, s);
	if (p === "claude-sub") return role === "chat" ? s.claude.chatModel : s.claude.summaryModel;
	return role === "chat" ? s.openai.chatModel : s.openai.summaryModel || s.openai.chatModel;
}

export function supportsVision(role: Role, s: AppSettings = getSettings()): boolean {
	return providerFor(role, s) === "claude-sub" ? true : s.openai.vision;
}

export async function complete(role: Role, req: Omit<CompleteRequest, "model">): Promise<string> {
	const s = getSettings();
	const provider = providerFor(role, s);
	const model = modelFor(role, s);
	if (provider === "claude-sub") return claudeComplete(s.claude, claudeApiKey(), { ...req, model });
	return openaiComplete(s.openai, openaiApiKey(s.openai), { ...req, model });
}
