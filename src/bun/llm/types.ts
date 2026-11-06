export type HistoryTurn = { role: "user" | "assistant"; text: string };

/** 모델이 부를 수 있는 앱 도구 (지금은 웹 검색만) */
export type AppTool = {
	name: string;
	description: string;
	/** JSON Schema properties (문자열 파라미터만) */
	params: Record<string, { type: "string"; description: string; enum?: string[] }>;
	required: string[];
	run: (args: Record<string, unknown>) => Promise<string>;
};

export type CompleteRequest = {
	model: string;
	system: string;
	history: HistoryTurn[];
	userText: string;
	/** JPEG 파일 경로들 */
	images: string[];
	onDelta?: (delta: string) => void;
	signal?: AbortSignal;
	maxTokens?: number;
	tools?: AppTool[];
};
