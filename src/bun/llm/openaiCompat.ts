// OpenAI 호환 Chat Completions 클라이언트 (Ollama Cloud / 로컬 Ollama / 기타).
// 외부 SDK 없이 fetch + SSE 파싱으로 구현한다.

import type { ModelInfo, ProviderSettings, TestResult } from "../../shared/types";

export type ContentPart =
	| { type: "text"; text: string }
	| { type: "image_url"; image_url: { url: string } };

export type OAIMessage =
	| { role: "system"; content: string }
	| { role: "user"; content: string | ContentPart[] }
	| { role: "assistant"; content: string };

function headers(apiKey: string | null): Record<string, string> {
	const h: Record<string, string> = { "Content-Type": "application/json" };
	if (apiKey) h.Authorization = `Bearer ${apiKey}`;
	return h;
}

function base(p: ProviderSettings): string {
	return p.baseUrl.trim().replace(/\/+$/, "");
}

async function errorText(res: Response): Promise<string> {
	const body = await res.text().catch(() => "");
	try {
		const j = JSON.parse(body);
		return `${res.status} ${j.error?.message ?? j.error ?? body}`.slice(0, 300);
	} catch {
		return `${res.status} ${body}`.slice(0, 300);
	}
}

/** /v1/models → 실패 시 Ollama 네이티브 /api/tags 로 대체 */
export async function listModels(
	p: ProviderSettings,
	apiKey: string | null,
): Promise<{ ok: boolean; models: ModelInfo[]; detail?: string }> {
	try {
		const res = await fetch(`${base(p)}/models`, { headers: headers(apiKey) });
		if (res.ok) {
			const j = (await res.json()) as { data?: { id: string }[] };
			const models = (j.data ?? []).map((m) => ({ id: m.id })).sort((a, b) => a.id.localeCompare(b.id));
			if (models.length) return { ok: true, models };
		}
		const tagsUrl = base(p).replace(/\/v1$/, "") + "/api/tags";
		const res2 = await fetch(tagsUrl, { headers: headers(apiKey) });
		if (res2.ok) {
			const j = (await res2.json()) as { models?: { name?: string; model?: string }[] };
			const models = (j.models ?? [])
				.map((m) => ({ id: (m.model ?? m.name ?? "").trim() }))
				.filter((m) => m.id)
				.sort((a, b) => a.id.localeCompare(b.id));
			return { ok: true, models };
		}
		return { ok: false, models: [], detail: await errorText(res) };
	} catch (err) {
		return { ok: false, models: [], detail: String(err) };
	}
}

/**
 * 스트리밍 채팅. onDelta로 조각을 넘기고 최종 텍스트를 반환한다.
 */
export async function streamChat(opts: {
	provider: ProviderSettings;
	apiKey: string | null;
	messages: OAIMessage[];
	onDelta: (delta: string) => void;
	signal?: AbortSignal;
	maxTokens?: number;
}): Promise<string> {
	const res = await fetch(`${base(opts.provider)}/chat/completions`, {
		method: "POST",
		headers: headers(opts.apiKey),
		signal: opts.signal,
		body: JSON.stringify({
			model: opts.provider.model,
			messages: opts.messages,
			stream: true,
			max_tokens: opts.maxTokens ?? 2048,
		}),
	});
	if (!res.ok || !res.body) throw new Error(await errorText(res));

	const reader = res.body.getReader();
	const decoder = new TextDecoder();
	let buf = "";
	let full = "";
	for (;;) {
		const { done, value } = await reader.read();
		if (done) break;
		buf += decoder.decode(value, { stream: true });
		let nl: number;
		while ((nl = buf.indexOf("\n")) >= 0) {
			const line = buf.slice(0, nl).trim();
			buf = buf.slice(nl + 1);
			if (!line.startsWith("data:")) continue;
			const data = line.slice(5).trim();
			if (data === "[DONE]") return full;
			try {
				const j = JSON.parse(data);
				if (j.error) throw new Error(j.error.message ?? String(j.error));
				const delta: string | undefined = j.choices?.[0]?.delta?.content;
				if (delta) {
					full += delta;
					opts.onDelta(delta);
				}
			} catch (err) {
				if (err instanceof SyntaxError) continue; // 불완전한 줄은 무시
				throw err;
			}
		}
	}
	return full;
}

/** 연결 테스트용 32x32 빨간 사각형 PNG */
const TEST_IMAGE =
	"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAKklEQVR4nGO4q6REU8QwasGoBaMWjFowasGoBaMWjFowasGoBaMWDBULANL8hD3ndtChAAAAAElFTkSuQmCC";

export async function testConnection(p: ProviderSettings, apiKey: string | null): Promise<TestResult> {
	if (!p.baseUrl) return { ok: false, detail: "Base URL이 비어 있어요." };
	if (!p.model) return { ok: false, detail: "모델을 먼저 골라 주세요." };
	try {
		const text = await streamChat({
			provider: p,
			apiKey,
			maxTokens: 20,
			messages: [{ role: "user", content: "Reply with exactly: OK" }],
			onDelta: () => {},
		});
		let vision = false;
		let visionDetail = "";
		try {
			const v = await streamChat({
				provider: p,
				apiKey,
				maxTokens: 20,
				messages: [
					{
						role: "user",
						content: [
							{ type: "text", text: "What color is this image? Answer in one word." },
							{ type: "image_url", image_url: { url: TEST_IMAGE } },
						],
					},
				],
				onDelta: () => {},
			});
			vision = /red|빨강|빨간/i.test(v);
			visionDetail = vision ? "이미지 인식 가능" : `이미지 응답이 불확실함 ("${v.trim().slice(0, 40)}")`;
		} catch (err) {
			visionDetail = `이미지 입력 미지원 (${String(err).slice(0, 120)})`;
		}
		return { ok: true, vision, detail: `텍스트 응답 OK ("${text.trim().slice(0, 40)}"). ${visionDetail}` };
	} catch (err) {
		return { ok: false, detail: String(err).slice(0, 300) };
	}
}
