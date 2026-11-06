// Claude 구독 제공자: Claude Agent SDK로 이 Mac에 로그인된 Claude Code 인증을 그대로 쓴다.
// API 키가 Keychain에 있으면 그 키로 API 과금, 없으면 구독(claude.ai 로그인)으로 동작한다.
// 개인용 전제: 남에게 배포하는 앱에서 claude.ai 구독 로그인을 제공하는 것은 허용되지 않는다.

import { query, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ClaudeSettings, ModelInfo, TestResult } from "../../shared/types";
import { dataDir } from "../settings";
import type { CompleteRequest } from "./types";

const workDir = join(dataDir, "claude-cwd");
if (!existsSync(workDir)) mkdirSync(workDir, { recursive: true });

export const CLAUDE_MODELS: ModelInfo[] = [
	{ id: "sonnet", label: "Sonnet (최신)" },
	{ id: "opus", label: "Opus (최신)" },
	{ id: "haiku", label: "Haiku (최신)" },
	{ id: "claude-sonnet-5-5", label: "Claude Sonnet 5.5" },
	{ id: "claude-opus-5-5", label: "Claude Opus 5.5" },
	{ id: "claude-haiku-5-5", label: "Claude Haiku 5.5" },
];

function childEnv(apiKey: string | null): Record<string, string | undefined> {
	const env: Record<string, string | undefined> = { ...process.env, CLAUDE_AGENT_SDK_CLIENT_APP: "study-pet/0.1" };
	// 사용자가 앱에 키를 넣지 않았다면 셸 환경의 키가 섞여 들어오지 않게 지워서 구독 로그인을 쓰게 한다
	if (apiKey) env.ANTHROPIC_API_KEY = apiKey;
	else delete env.ANTHROPIC_API_KEY;
	// 앱 번들에서 실행되면 PATH가 짧으므로 흔한 설치 경로를 덧붙인다
	const home = process.env.HOME ?? "";
	env.PATH = [env.PATH, "/opt/homebrew/bin", "/usr/local/bin", `${home}/.local/bin`, `${home}/.claude/local`]
		.filter(Boolean)
		.join(":");
	return env;
}

function transcript(req: CompleteRequest): string {
	if (!req.history.length) return req.userText;
	const past = req.history
		.map((t) => `${t.role === "user" ? "사용자" : "잉키"}: ${t.text}`)
		.join("\n\n");
	return `<이전_대화>\n${past}\n</이전_대화>\n\n${req.userText}`;
}

async function* singleMessage(req: CompleteRequest): AsyncIterable<SDKUserMessage> {
	const content: any[] = [];
	for (const path of req.images) {
		const bytes = await Bun.file(path).arrayBuffer();
		content.push({
			type: "image",
			source: { type: "base64", media_type: "image/jpeg", data: Buffer.from(bytes).toString("base64") },
		});
	}
	content.push({ type: "text", text: transcript(req) });
	yield {
		type: "user",
		message: { role: "user", content },
		parent_tool_use_id: null,
	};
}

export async function claudeComplete(
	cfg: ClaudeSettings,
	apiKey: string | null,
	req: CompleteRequest,
): Promise<string> {
	const abortController = new AbortController();
	const onAbort = () => abortController.abort();
	req.signal?.addEventListener("abort", onAbort);

	const q = query({
		prompt: singleMessage(req),
		options: {
			model: req.model || cfg.chatModel || "sonnet",
			systemPrompt: req.system,
			tools: [], // 내장 도구(Bash, Edit 등) 전부 끔: 답변만 한다
			maxTurns: 1,
			persistSession: false,
			settingSources: [],
			includePartialMessages: Boolean(req.onDelta),
			cwd: workDir,
			env: childEnv(apiKey),
			abortController,
			...(cfg.cliPath.trim() ? { pathToClaudeCodeExecutable: cfg.cliPath.trim() } : {}),
		},
	});

	let streamed = "";
	try {
		for await (const msg of q) {
			if (msg.type === "stream_event") {
				const ev: any = msg.event;
				if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta" && ev.delta.text) {
					streamed += ev.delta.text;
					req.onDelta?.(ev.delta.text);
				}
			} else if (msg.type === "assistant" && (msg as any).error) {
				throw new Error(`Claude 오류: ${(msg as any).error}`);
			} else if (msg.type === "result") {
				if (msg.subtype === "success" && !msg.is_error) return msg.result || streamed;
				const errs = (msg as any).errors as string[] | undefined;
				throw new Error(errs?.join("; ") || (msg as any).result || `Claude 실행 실패 (${msg.subtype})`);
			}
		}
		return streamed;
	} finally {
		req.signal?.removeEventListener("abort", onAbort);
	}
}

export async function claudeTest(cfg: ClaudeSettings, apiKey: string | null): Promise<TestResult> {
	try {
		const text = await claudeComplete(cfg, apiKey, {
			model: cfg.chatModel,
			system: "Reply tersely.",
			history: [],
			userText: "Reply with exactly: OK",
			images: [],
		});
		const how = apiKey ? "API 키" : "Claude 구독 로그인";
		return { ok: true, vision: true, detail: `${how}으로 응답 OK ("${text.trim().slice(0, 40)}")` };
	} catch (err) {
		const msg = String(err);
		const hint = /auth|login|401|credential/i.test(msg)
			? " 터미널에서 `claude`를 한 번 실행해 로그인했는지 확인해 줘."
			: "";
		return { ok: false, detail: msg.slice(0, 300) + hint };
	}
}

