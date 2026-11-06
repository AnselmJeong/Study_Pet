// TinyFish 웹 검색 (https://docs.tinyfish.ai/search-api).
// GET https://api.search.tinyfish.ai?query=... , 헤더 X-API-Key. 키는 Keychain에만 둔다.

import type { TestResult } from "../shared/types";
import { getSettings, tinyfishApiKey } from "./settings";
import type { AppTool } from "./llm/types";

const ENDPOINT = "https://api.search.tinyfish.ai";
const MAX_RESULTS = 6;

export type SearchDomain = "web" | "news" | "research_paper";

export type SearchResult = { position: number; site_name: string; title: string; snippet: string; url: string };

export async function tinyfishSearch(
	query: string,
	apiKey: string,
	opts: { domain?: SearchDomain; signal?: AbortSignal } = {},
): Promise<SearchResult[]> {
	const u = new URL(ENDPOINT);
	u.searchParams.set("query", query);
	if (opts.domain && opts.domain !== "web") u.searchParams.set("domain_type", opts.domain);
	const res = await fetch(u, {
		headers: { "X-API-Key": apiKey, Accept: "application/json" },
		signal: opts.signal ?? AbortSignal.timeout(20_000),
	});
	const body = await res.text();
	if (!res.ok) {
		let msg = body.slice(0, 200);
		try {
			const j = JSON.parse(body);
			msg = j.error?.message ?? j.error?.code ?? msg;
		} catch {}
		throw new Error(`TinyFish 검색 실패 (${res.status}): ${msg}`);
	}
	const j = JSON.parse(body) as { results?: any[] };
	return (j.results ?? []).slice(0, MAX_RESULTS).map((r, i) => ({
		position: Number(r.position ?? i + 1),
		site_name: String(r.site_name ?? ""),
		title: String(r.title ?? ""),
		snippet: String(r.snippet ?? ""),
		url: String(r.url ?? ""),
	}));
}

/** 모델에게 넘길 텍스트 형태 */
export function formatResults(query: string, results: SearchResult[]): string {
	if (!results.length) return `"${query}" 검색 결과 없음`;
	return [
		`"${query}" 웹 검색 결과:`,
		...results.map((r, i) => `[${i + 1}] ${r.title}${r.site_name ? ` (${r.site_name})` : ""}\n${r.url}\n${r.snippet}`),
	].join("\n\n");
}

/** 검색을 쓸 수 있으면 키를, 아니면 null */
export function searchKey(): string | null {
	const s = getSettings();
	if (!s.search.enabled) return null;
	return tinyfishApiKey();
}

/** 대화 모델이 필요할 때 부르는 웹 검색 도구 */
export function webSearchTool(apiKey: string, onUse?: (query: string) => void): AppTool {
	return {
		name: "web_search",
		description:
			"인터넷을 검색한다. 최신 정보, 사실 확인, 논문·문서 찾기, 화면에 없는 내용이 필요할 때만 쓴다. 결과의 제목, URL, 요약을 돌려준다.",
		params: {
			query: { type: "string", description: "검색어 (필요하면 영어로)" },
			domain_type: {
				type: "string",
				enum: ["web", "news", "research_paper"],
				description: "web(기본), news(뉴스), research_paper(논문)",
			},
		},
		required: ["query"],
		run: async (args) => {
			const query = String(args.query ?? "").trim();
			if (!query) return "검색어가 비어 있음";
			onUse?.(query);
			const domain = (["web", "news", "research_paper"] as const).find((d) => d === args.domain_type) ?? "web";
			try {
				return formatResults(query, await tinyfishSearch(query, apiKey, { domain }));
			} catch (err) {
				return String(err);
			}
		},
	};
}

export async function testSearch(override?: string | null): Promise<TestResult> {
	const key = tinyfishApiKey(override);
	if (!key) return { ok: false, detail: "TinyFish API 키를 넣어 줘." };
	try {
		const r = await tinyfishSearch("free energy principle Friston", key);
		return { ok: true, detail: `검색 OK (${r.length}건, 첫 결과: ${r[0]?.title.slice(0, 40) ?? "-"})` };
	} catch (err) {
		return { ok: false, detail: String(err).slice(0, 300) };
	}
}
