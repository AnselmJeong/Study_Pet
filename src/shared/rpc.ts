import type { RPCSchema } from "electrobun/main";
import type {
	AppSettings,
	CaptureState,
	ChatMessage,
	ModelInfo,
	PetMood,
	ProviderId,
	ScreenPermission,
	TestResult,
	TimelineEntry,
} from "./types";

type Tab = "chat" | "timeline" | "settings";

/** 펫 창과 패널 창이 같은 스키마를 쓴다 */
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
			/** apiKeys: undefined = 그대로, null/"" = 삭제, 문자열 = 저장 */
			saveSettings: {
				params: { settings: AppSettings; apiKeys?: { claude?: string | null; openai?: string | null } };
				response: AppSettings;
			};
			listModels: {
				params: { provider: ProviderId; settings: AppSettings; apiKey?: string | null };
				response: { ok: boolean; models: ModelInfo[]; detail?: string };
			};
			testConnection: {
				params: { provider: ProviderId; settings: AppSettings; apiKey?: string | null };
				response: TestResult;
			};
			getScreenPermission: { params: {}; response: ScreenPermission };
			requestScreenPermission: { params: {}; response: ScreenPermission };
			openPanel: { params: { tab?: Tab }; response: { ok: boolean } };
			resizePet: { params: { width: number; height: number }; response: { ok: boolean } };
			/** 펫 창을 옆으로 천천히 이동 (걷기 행동). 화면 밖으로는 안 나감 */
			walkPet: { params: { dx: number; durationMs: number }; response: { ok: boolean } };
			getCaptureState: { params: {}; response: CaptureState };
			startCapture: { params: { goal: string }; response: CaptureState };
			stopCapture: { params: {}; response: CaptureState };
			getTimeline: { params: {}; response: TimelineEntry[] };
		};
		messages: {};
	}>;
	webview: RPCSchema<{
		requests: {};
		messages: {
			messageAdded: ChatMessage;
			messageDelta: { id: string; delta: string };
			messageDone: { id: string; text: string; error?: boolean };
			historyCleared: {};
			mood: { mood: PetMood };
			focusInput: {};
			showTab: { tab: Tab };
			settingsChanged: AppSettings;
			captureState: CaptureState;
			timelineAdded: TimelineEntry;
			/** 펫이 먼저 건네는 말 (격려, 농담, 휴식 권유) */
			petSays: { text: string; kind: "encourage" | "joke" | "break" | "nudge" };
		};
	}>;
};
