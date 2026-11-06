export type HistoryTurn = { role: "user" | "assistant"; text: string };

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
};
