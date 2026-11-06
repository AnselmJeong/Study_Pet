// Bun(메인)과 WebView(펫/패널)가 함께 쓰는 타입

/** LLM 제공자 종류 */
export type ProviderId = "claude-sub" | "openai-compat";

export type ClaudeSettings = {
	/** 대화에 쓸 모델 (별칭 sonnet/opus/haiku 또는 전체 모델 ID) */
	chatModel: string;
	/** 1분 화면 요약에 쓸 모델 */
	summaryModel: string;
	/** Claude Code 실행 파일 경로 (비우면 SDK 내장 실행 파일 사용) */
	cliPath: string;
	/** API 키가 Keychain에 있으면 구독 대신 API 과금으로 동작 */
	hasApiKey: boolean;
};

export type OpenAIPreset = "ollama-cloud" | "custom";

export type OpenAISettings = {
	preset: OpenAIPreset;
	baseUrl: string;
	chatModel: string;
	summaryModel: string;
	/** 선택한 모델이 이미지를 이해하는지 */
	vision: boolean;
	hasApiKey: boolean;
};

export type CaptureSettings = {
	intervalSec: number;
	maxShots: number;
	/** 캡처하지 않을 앱 이름 (부분 일치, 대소문자 무시) */
	excludedApps: string[];
	/** 입력이 없는 시간이 이 값을 넘으면 캡처를 건너뜀 */
	idleSkipSec: number;
	/** 이 시간(분)보다 오래된 스크린샷은 자동 삭제 (텍스트 요약은 남김) */
	retentionMin: number;
	/** 입력도 화면 변화도 없이 이 시간(분)이 지나면 자동 일시정지 */
	autoPauseMin: number;
	/** 입력이 없는 동안(영상 시청 등)에는 이 간격(분)으로만 캡처·요약 */
	idleIntervalMin: number;
};

export type ProactiveSettings = {
	/** 사용자가 아무것도 안 해도 펫이 가끔 격려나 농담을 건넴 */
	enabled: boolean;
	/** 말 거는 간격 (분), 이 범위에서 무작위 */
	minIntervalMin: number;
	maxIntervalMin: number;
	/** 농담 섞기 */
	jokes: boolean;
};

export type SearchSettings = {
	/** TinyFish 웹 검색 사용 */
	enabled: boolean;
	hasApiKey: boolean;
};

export type AppSettings = {
	chatProvider: ProviderId;
	summaryProvider: ProviderId;
	claude: ClaudeSettings;
	openai: OpenAISettings;
	capture: CaptureSettings;
	proactive: ProactiveSettings;
	search: SearchSettings;
	/** 질문할 때 현재 화면을 기본으로 첨부할지 */
	attachScreenByDefault: boolean;
	tone: "banmal" | "jondaetmal";
	/** 펫 캐릭터 팩 id ("inky" = 기본 잉키). docs/CHARACTER_PACKS.md */
	petPackId: string;
};

export type ChatMessage = {
	id: string;
	role: "user" | "assistant";
	text: string;
	withScreen?: boolean;
	/** 이 질문에 웹 검색을 썼는지 */
	searched?: boolean;
	ts: number;
	error?: boolean;
};

export type PetMood = "idle" | "thinking" | "talking" | "happy" | "error" | "focus";

/** 가만히 있을 때 가끔 하는 행동 (mood와 별개로 재생) */
export type PetAction = "none" | "hop" | "lookAround" | "stretch" | "read" | "wave" | "doze" | "spin" | "walk";

export type ModelInfo = { id: string; label?: string };

export type TestResult = { ok: boolean; detail: string; vision?: boolean };

export type ScreenPermission = { granted: boolean };

export type Activity = "reading" | "writing" | "coding" | "searching" | "video" | "chat" | "other";
export type Relevance = "on_task" | "related" | "off_task" | "break" | "unknown";

export type TimelineEntry = {
	id: string;
	ts: number;
	app: string;
	summary: string;
	activity: Activity;
	relevance: Relevance;
	keyTerms: string[];
	/** 스크린샷이 링버퍼에 남아 있으면 경로 */
	shotPath?: string;
	/** 캡처를 건너뛴 이유 (제외 앱, 자리 비움, 권한 없음 등) */
	skipped?: string;
	error?: string;
	/** 화면이 바뀌지 않아 이 항목이 이어진 횟수 (기록 간격 단위) */
	repeats?: number;
};

export type CaptureState = {
	running: boolean;
	/** 입력도 화면 변화도 없어서 자동 일시정지된 상태 */
	paused: boolean;
	goal: string;
	startedAt: number | null;
	lastCaptureAt: number | null;
};
