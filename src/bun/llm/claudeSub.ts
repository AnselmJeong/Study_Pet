// Claude 구독 제공자: Claude Agent SDK로 이 Mac에 로그인된 Claude Code 인증을 그대로 쓴다.
// API 키가 Keychain에 있으면 그 키로 API 과금, 없으면 구독(claude.ai 로그인)으로 동작한다.
// 개인용 전제: 남에게 배포하는 앱에서 claude.ai 구독 로그인을 제공하는 것은 허용되지 않는다.

import { createSdkMcpServer, query, tool, type SDKUserMessage } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import { existsSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import type { ClaudeSettings, ModelInfo, TestResult } from "../../shared/types";
import { dataDir } from "../settings";
import type { AppTool, CompleteRequest } from "./types";

const MCP_NAME = "studypet";

/** 앱 도구를 인프로세스 MCP 서버로 노출한다 (내장 도구는 계속 꺼 둔다) */
function mcpFor(tools: AppTool[]) {
	return createSdkMcpServer({
		name: MCP_NAME,
		version: "0.1.0",
		tools: tools.map((t) => {
			const shape: Record<string, z.ZodTypeAny> = {};
			for (const [k, p] of Object.entries(t.params)) {
				let f: z.ZodTypeAny = p.enum?.length ? z.enum(p.enum as [string, ...string[]]) : z.string();
				f = f.describe(p.description);
				shape[k] = t.required.includes(k) ? f : f.optional();
			}
			return tool(t.name, t.description, shape, async (args) => ({
				content: [{ type: "text" as const, text: await t.run(args as Record<string, unknown>) }],
			}));
		}),
	});
}

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

// SDK는 내장 실행 파일을 import.meta.url 기준 node_modules에서 찾는다. /Applications의 앱 번들 옆에는
// node_modules가 없어서 Bun 자동 설치 캐시(~/.bun/install/cache)에 기대게 되므로 믿을 수 없다.
// 순서: 설정의 cliPath → 이 Mac에 설치된 `claude` → (개발 실행 시) node_modules의 SDK 내장 바이너리.
function resolveExecutable(cfg: ClaudeSettings): string | undefined {
	if (cfg.cliPath.trim()) return cfg.cliPath.trim();
	const home = process.env.HOME ?? "";
	const installed = [
		`${home}/.local/bin/claude`,
		"/opt/homebrew/bin/claude",
		"/usr/local/bin/claude",
		`${home}/.claude/local/claude`,
	].find((p) => existsSync(p));
	if (installed) return installed;
	try {
		const req = createRequire(import.meta.url);
		const p = req.resolve(`@anthropic-ai/claude-agent-sdk-${process.platform}-${process.arch}/claude`);
		if (existsSync(p)) return p;
	} catch {}
	return undefined; // SDK 기본 동작에 맡긴다
}

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

	const exe = resolveExecutable(cfg);
	const q = query({
		prompt: singleMessage(req),
		options: {
			model: req.model || cfg.chatModel || "sonnet",
			systemPrompt: req.system,
			tools: [], // 내장 도구(Bash, Edit 등) 전부 끔: 답변만 한다
			// 앱 도구(웹 검색)가 있으면 그것만 허용하고, 검색 후 답할 수 있게 턴을 몇 번 더 준다
			...(req.tools?.length
				? {
						mcpServers: { [MCP_NAME]: mcpFor(req.tools) },
						allowedTools: req.tools.map((t) => `mcp__${MCP_NAME}__${t.name}`),
						maxTurns: 5,
					}
				: { maxTurns: 1 }),
			persistSession: false,
			settingSources: [],
			includePartialMessages: Boolean(req.onDelta),
			cwd: workDir,
			env: childEnv(apiKey),
			abortController,
			...(exe ? { pathToClaudeCodeExecutable: exe } : {}),
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

