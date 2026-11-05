import { Utils } from "electrobun/main";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { AppSettings, ProviderPreset, ProviderSettings } from "../shared/types";
import { deleteApiKey, getApiKey, setApiKey } from "./keychain";

export const dataDir = Utils.paths.userData;
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

const settingsPath = join(dataDir, "settings.json");

export const PRESET_BASE_URL: Record<ProviderPreset, string> = {
	"ollama-cloud": "https://ollama.com/v1",
	"ollama-local": "http://localhost:11434/v1",
	custom: "",
};

/** Keychain 계정 이름: 프리셋별로 키를 따로 저장 */
export function keyAccount(p: Pick<ProviderSettings, "preset" | "baseUrl">): string {
	return p.preset === "custom" ? `custom:${p.baseUrl}` : p.preset;
}

const defaults: AppSettings = {
	provider: {
		preset: "ollama-cloud",
		baseUrl: PRESET_BASE_URL["ollama-cloud"],
		model: "",
		vision: true,
		hasApiKey: false,
	},
	attachScreenByDefault: true,
	tone: "banmal",
};

let current: AppSettings = load();

function load(): AppSettings {
	let s: AppSettings = structuredClone(defaults);
	if (existsSync(settingsPath)) {
		try {
			const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
			s = {
				...s,
				...raw,
				provider: { ...s.provider, ...(raw.provider ?? {}) },
			};
		} catch (err) {
			console.error("[settings] settings.json 읽기 실패, 기본값 사용", err);
		}
	}
	s.provider.hasApiKey = getApiKey(keyAccount(s.provider)) !== null;
	return s;
}

export function getSettings(): AppSettings {
	return current;
}

/**
 * apiKey: undefined = 그대로 둠, null 또는 "" = 삭제, 문자열 = 저장
 */
export function saveSettings(next: AppSettings, apiKey?: string | null): AppSettings {
	const provider = { ...next.provider, baseUrl: next.provider.baseUrl.trim().replace(/\/+$/, "") };
	const account = keyAccount(provider);
	if (apiKey !== undefined) {
		if (apiKey === null || apiKey.trim() === "") deleteApiKey(account);
		else setApiKey(account, apiKey.trim());
	}
	provider.hasApiKey = getApiKey(account) !== null;
	current = { ...next, provider };
	const { hasApiKey: _omit, ...providerOnDisk } = provider;
	writeFileSync(settingsPath, JSON.stringify({ ...current, provider: providerOnDisk }, null, 2));
	return current;
}

/** 설정 화면에서 아직 저장 전인 키로 테스트할 때를 위해 키를 고른다 */
export function resolveApiKey(provider: ProviderSettings, override?: string | null): string | null {
	if (override !== undefined && override !== null && override.trim() !== "") return override.trim();
	return getApiKey(keyAccount(provider));
}
