import type { RPCSchema } from "electrobun/main";
import type {
	AppSettings,
	AttachResult,
	Attachment,
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
import type { CharacterInfo } from "./character";

type Tab = "chat" | "timeline" | "settings";

/** 펫 창과 패널 창이 같은 스키마를 쓴다 */
export type StudyPetRPC = {
	bun: RPCSchema<{
		requests: {
			ask: {
				/** webSearch: true면 답하기 전에 질문으로 웹 검색을 먼저 한다. attachments: addAttachment/captureAttachment로 받은 id */
				params: { text: string; attachments?: string[]; webSearch?: boolean };
				response: { accepted: boolean; reason?: string; needsPermission?: boolean };
			};
			/** 붙여넣기·끌어놓기 이미지 (base64 또는 data URL) */
			addAttachment: { params: { data: string; mime: string }; response: AttachResult };
			/** screen: 지금 화면 전체, region: 영역/창 고르기. 펫(과 패널)을 잠깐 숨기고 찍는다 */
			captureAttachment: { params: { mode: "screen" | "region"; from: "pet" | "panel" }; response: AttachResult };
			discardAttachment: { params: { id: string }; response: { ok: boolean } };
			/** 시스템 설정 > 화면 기록 열기 */
			openScreenSettings: { params: {}; response: { ok: boolean } };
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
			/** 지금 고른 캐릭터 이름·성격 */
			getCharacter: { params: {}; response: CharacterInfo };
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
			/** 트레이 등에서 찍은 이미지를 펫 입력창에 붙인다 */
			attachmentAdded: Attachment;
			/** 첨부 캡처 실패를 펫 입력창에 보여 준다 */
			attachmentError: { reason: "permission" | "failed"; message: string };
			showTab: { tab: Tab };
			settingsChanged: AppSettings;
			/** 캐릭터를 바꾸면 이름도 바뀐다 */
			characterChanged: CharacterInfo;
			captureState: CaptureState;
			timelineAdded: TimelineEntry;
			/** 펫이 먼저 건네는 말 (격려, 농담, 휴식 권유) */
			petSays: { text: string; kind: "encourage" | "joke" | "break" | "nudge" };
		};
	}>;
};
