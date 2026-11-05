// Bun(메인)과 WebView(펫/패널)가 함께 쓰는 타입

export type ProviderPreset = "ollama-cloud" | "ollama-local" | "custom";

export type ProviderSettings = {
	preset: ProviderPreset;
	baseUrl: string;
	model: string;
	/** 선택한 모델이 이미지를 이해하는지 (연결 테스트로 확인하거나 사용자가 지정) */
	vision: boolean;
	/** API 키가 Keychain에 저장되어 있는지. 키 값 자체는 WebView로 보내지 않는다 */
	hasApiKey: boolean;
};

export type AppSettings = {
	provider: ProviderSettings;
	/** 질문할 때 현재 화면을 자동으로 첨부할지 */
	attachScreenByDefault: boolean;
	/** 말투 */
	tone: "banmal" | "jondaetmal";
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	text: string;
	/** 이 질문에 화면이 첨부되었는지 */
	withScreen?: boolean;
	ts: number;
	error?: boolean;
};

export type PetMood = "idle" | "thinking" | "talking" | "happy" | "error";

export type ModelInfo = { id: string };

export type TestResult = { ok: boolean; detail: string; vision?: boolean };

export type ScreenPermission = { granted: boolean };
