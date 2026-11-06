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
import type { PackInfo, ResolvedPack } from "./pack";

type Tab = "chat" | "timeline" | "settings";

/** 펫 창과 패널 창이 같은 스키마를 쓴다 */
export type StudyPetRPC = {
	bun: RPCSchema<{
		requests: {
			ask: {
				/** webSearch: true면 답하기 전에 질문으로 웹 검색을 먼저 한다 */
				params: { text: string; attachScreen: boolean; webSearch?: boolean };
				response: { accepted: boolean; reason?: string };
			};
			cancel: { params: {}; response: { ok: boolean } };
			getHistory: { params: {}; response: ChatMessage[] };
			clearHistory: { params: {}; response: { ok: boolean } };
			getSettings: { params: {}; response: AppSettings };
			/** apiKeys: undefined = 그대로, null/"" = 삭제, 문자열 = 저장 */
			saveSettings: {
				params: {
					settings: AppSettings;
					apiKeys?: { claude?: string | null; openai?: string | null; tinyfish?: string | null };
				};
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
			testSearch: { params: { apiKey?: string | null }; response: TestResult };
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
			/** 캐릭터 팩 (docs/CHARACTER_PACKS.md). 기본 팩은 WebView가 직접 들고 있다 */
			listPacks: { params: {}; response: PackInfo[] };
			getPack: { params: { id: string }; response: { pack: ResolvedPack | null } };
			setPetPack: { params: { id: string }; response: AppSettings };
			importPack: { params: {}; response: { ok: boolean; info?: PackInfo; error?: string; canceled?: boolean } };
			removePack: { params: { id: string }; response: { ok: boolean } };
			openPacksFolder: { params: {}; response: { ok: boolean } };
			/** 우클릭 시 WebView 기본 메뉴(새로 고침/검사) 대신 앱 네이티브 메뉴를 띄운다 */
			showContextMenu: { params: { where: "pet" | "panel"; editable?: boolean; hasSelection?: boolean }; response: { ok: boolean } };
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
