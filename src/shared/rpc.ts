import type { RPCSchema } from "electrobun/main";
import type {
	AppSettings,
	ChatMessage,
	ModelInfo,
	PetMood,
	ProviderSettings,
	ScreenPermission,
	TestResult,
} from "./types";

/** 펫 창과 패널 창이 같은 스키마를 쓴다 (둘 다 같은 메시지를 받는다) */
export type StudyPetRPC = {
	bun: RPCSchema<{
		requests: {
			ask: {
				params: { text: string; attachScreen: boolean };
				response: { accepted: boolean; reason?: string };
			};
			cancel: { params: {}; response: { ok: boolean } };
			getHistory: { params: {}; response: ChatMessage[] };
			clearHistory: { params: {}; response: { ok: boolean } };
			getSettings: { params: {}; response: AppSettings };
			saveSettings: {
				params: { settings: AppSettings; apiKey?: string | null };
				response: AppSettings;
			};
			listModels: {
				params: { provider: ProviderSettings; apiKey?: string | null };
				response: { ok: boolean; models: ModelInfo[]; detail?: string };
			};
			testConnection: {
				params: { provider: ProviderSettings; apiKey?: string | null };
				response: TestResult;
			};
			getScreenPermission: { params: {}; response: ScreenPermission };
			requestScreenPermission: { params: {}; response: ScreenPermission };
			openPanel: { params: { tab?: "chat" | "settings" }; response: { ok: boolean } };
			resizePet: {
				params: { width: number; height: number };
				response: { ok: boolean };
			};
			petClicked: { params: {}; response: { ok: boolean } };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			/** 새 메시지(사용자 질문 또는 빈 assistant 메시지)가 생겼을 때 */
			messageAdded: ChatMessage;
			/** assistant 메시지 스트리밍 조각 */
			messageDelta: { id: string; delta: string };
			/** assistant 메시지 완료 (최종 텍스트 포함) */
			messageDone: { id: string; text: string; error?: boolean };
			historyCleared: {};
			mood: { mood: PetMood };
			/** 펫 창에서 입력창을 열라는 신호 (전역 단축키) */
			focusInput: {};
			/** 패널에서 보여줄 탭 */
			showTab: { tab: "chat" | "settings" };
			settingsChanged: AppSettings;
		};
	}>;
};
