import { Utils } from "electrobun/main";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings, OpenAIPreset, OpenAISettings } from "../shared/types";
import { deleteApiKey, getApiKey, setApiKey } from "./keychain";

export const dataDir = Utils.paths.userData;
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const settingsPath = join(dataDir, "settings.json");

export const OPENAI_PRESET_URL: Record<OpenAIPreset, string> = {
	"ollama-cloud": "https://ollama.com/v1",
	custom: "",
};

const CLAUDE_ACCOUNT = "claude-api";
const TINYFISH_ACCOUNT = "tinyfish";
export function openaiAccount(o: Pick<OpenAISettings, "preset" | "baseUrl">): string {
	return o.preset === "custom" ? `custom:${o.baseUrl}` : o.preset;
}

const defaults: AppSettings = {
	chatProvider: "claude-sub",
	summaryProvider: "claude-sub",
	claude: { chatModel: "sonnet", summaryModel: "sonnet", cliPath: "", hasApiKey: false },
	openai: {
		preset: "ollama-cloud",
		baseUrl: OPENAI_PRESET_URL["ollama-cloud"],
		chatModel: "",
		summaryModel: "",
		vision: true,
		hasApiKey: false,
	},
	capture: {
		intervalSec: 60,
		maxShots: 20,
		excludedApps: ["1Password", "Keychain Access", "키체인 접근", "KakaoTalk", "카카오톡", "Messages", "메시지", "Slack", "System Settings", "시스템 설정"],
		idleSkipSec: 120,
		retentionMin: 60,
		autoPauseMin: 5,
		idleIntervalMin: 3,
	},
	proactive: { enabled: true, minIntervalMin: 12, maxIntervalMin: 25, jokes: true },
	search: { enabled: true, hasApiKey: false },
	attachScreenByDefault: true,
	tone: "banmal",
	petPackId: "inky",
};

function refreshKeyFlags(s: AppSettings): AppSettings {
	s.claude.hasApiKey = getApiKey(CLAUDE_ACCOUNT) !== null;
	s.openai.hasApiKey = getApiKey(openaiAccount(s.openai)) !== null;
	s.search.hasApiKey = getApiKey(TINYFISH_ACCOUNT) !== null;
	return s;
}

function load(): AppSettings {
	const s: AppSettings = structuredClone(defaults);
	if (existsSync(settingsPath)) {
		try {
			const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
			// M0 형식(provider 하나) → 새 형식으로 이전
			if (raw.provider && !raw.openai) {
				const p = raw.provider;
				if (p.preset === "custom") {
					raw.openai = { preset: "custom", baseUrl: p.baseUrl, chatModel: p.model, summaryModel: p.model, vision: p.vision };
				} else if (p.preset === "ollama-cloud") {
					raw.openai = { preset: "ollama-cloud", baseUrl: p.baseUrl, chatModel: p.model, summaryModel: p.model, vision: p.vision };
				}
				delete raw.provider;
			}
			Object.assign(s, raw);
			s.claude = { ...defaults.claude, ...(raw.claude ?? {}) };
			s.openai = { ...defaults.openai, ...(raw.openai ?? {}) };
			s.capture = { ...defaults.capture, ...(raw.capture ?? {}) };
			s.proactive = { ...defaults.proactive, ...(raw.proactive ?? {}) };
			s.search = { ...defaults.search, ...(raw.search ?? {}) };
		} catch (err) {
			console.error("[settings] settings.json 읽기 실패, 기본값 사용", err);
		}
	}
	return refreshKeyFlags(s);
}

let current: AppSettings = load();

export function getSettings(): AppSettings {
	return current;
}

function applyKey(account: string, key: string | null | undefined) {
	if (key === undefined) return;
	if (key === null || key.trim() === "") deleteApiKey(account);
	else setApiKey(account, key.trim());
}

export function saveSettings(
	next: AppSettings,
	apiKeys?: { claude?: string | null; openai?: string | null; tinyfish?: string | null },
): AppSettings {
	const s: AppSettings = structuredClone(next);
	// 캐릭터는 설정 > 캐릭터에서 바로 바뀌므로(setPetPackId) 저장 버튼이 옛 값으로 덮어쓰지 않게 한다
	s.petPackId = current.petPackId;
	s.openai.baseUrl = s.openai.baseUrl.trim().replace(/\/+$/, "");
	s.capture.intervalSec = Math.max(20, Math.min(600, Math.round(s.capture.intervalSec || 60)));
	s.capture.maxShots = Math.max(1, Math.min(100, Math.round(s.capture.maxShots || 20)));
	s.capture.retentionMin = Math.max(5, Math.min(24 * 60, Math.round(s.capture.retentionMin || 60)));
	s.capture.autoPauseMin = Math.max(2, Math.min(60, Math.round(s.capture.autoPauseMin || 5)));
	s.capture.idleIntervalMin = Math.max(1, Math.min(15, Math.round(s.capture.idleIntervalMin || 3)));
	s.proactive.minIntervalMin = Math.max(3, Math.round(s.proactive.minIntervalMin || 12));
	s.proactive.maxIntervalMin = Math.max(s.proactive.minIntervalMin, Math.round(s.proactive.maxIntervalMin || 25));
	applyKey(CLAUDE_ACCOUNT, apiKeys?.claude);
	applyKey(openaiAccount(s.openai), apiKeys?.openai);
	applyKey(TINYFISH_ACCOUNT, apiKeys?.tinyfish);
	current = refreshKeyFlags(s);
	const onDisk = structuredClone(current) as any;
	delete onDisk.claude.hasApiKey;
	delete onDisk.openai.hasApiKey;
	delete onDisk.search.hasApiKey;
	writeFileSync(settingsPath, JSON.stringify(onDisk, null, 2));
	return current;
}

export function setPetPackId(id: string): AppSettings {
	current = { ...current, petPackId: id };
	return saveSettings(current);
}

/** 아직 저장 전인 키(override)가 있으면 그것을, 없으면 Keychain 값을 쓴다 */
export function claudeApiKey(override?: string | null): string | null {
	if (override && override.trim()) return override.trim();
	return getApiKey(CLAUDE_ACCOUNT);
}

export function tinyfishApiKey(override?: string | null): string | null {
	if (override && override.trim()) return override.trim();
	return getApiKey(TINYFISH_ACCOUNT);
}

export function openaiApiKey(o: OpenAISettings, override?: string | null): string | null {
	if (override && override.trim()) return override.trim();
	return getApiKey(openaiAccount(o));
}
