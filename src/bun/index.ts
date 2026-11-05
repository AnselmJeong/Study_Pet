import {
	ApplicationMenu,
	BrowserView,
	BrowserWindow,
	GlobalShortcut,
	Screen,
	Tray,
	Utils,
} from "electrobun/main";
import type { StudyPetRPC } from "../shared/rpc";
import type { ChatMessage, PetMood } from "../shared/types";
import * as chat from "./chat";
import { hasScreenPermission, requestScreenPermission } from "./capture";
import { listModels, testConnection } from "./llm/openaiCompat";
import { getSettings, resolveApiKey, saveSettings } from "./settings";

const PET_COMPACT = { width: 150, height: 170 };
const MARGIN = 24;

// ---------- 창 사이 메시지 브로드캐스트 ----------

type Win = BrowserWindow<ReturnType<typeof makeRPC>>;
let petWin: Win | null = null;
let panelWin: Win | null = null;

function send<K extends keyof StudyPetRPC["webview"]["messages"]>(
	name: K,
	payload: StudyPetRPC["webview"]["messages"][K],
	only?: "pet" | "panel",
) {
	for (const [kind, w] of [
		["pet", petWin],
		["panel", panelWin],
	] as const) {
		if (!w || (only && only !== kind)) continue;
		try {
			(w.webview.rpc as any)?.send?.[name]?.(payload);
		} catch (err) {
			console.error(`[rpc] ${String(name)} → ${kind} 실패`, err);
		}
	}
}

const chatEvents: chat.ChatEvents = {
	messageAdded: (m: ChatMessage) => send("messageAdded", m),
	messageDelta: (id, delta) => send("messageDelta", { id, delta }),
	messageDone: (id, text, error) => send("messageDone", { id, text, error }),
	mood: (mood: PetMood) => send("mood", { mood }),
};

// ---------- RPC ----------

function makeRPC() {
	return BrowserView.defineRPC<StudyPetRPC>({
		maxRequestTime: 120_000,
		handlers: {
			requests: {
				ask: async ({ text, attachScreen }) => {
					const t = text.trim();
					if (!t) return { accepted: false, reason: "빈 질문" };
					if (chat.isBusy()) return { accepted: false, reason: "이전 답을 쓰는 중이야" };
					void chat.ask(t, attachScreen, chatEvents);
					return { accepted: true };
				},
				cancel: () => ({ ok: chat.cancel() }),
				getHistory: () => chat.getHistory(),
				clearHistory: () => {
					chat.clearHistory();
					send("historyCleared", {});
					return { ok: true };
				},
				getSettings: () => getSettings(),
				saveSettings: ({ settings, apiKey }) => {
					const s = saveSettings(settings, apiKey);
					send("settingsChanged", s);
					return s;
				},
				listModels: ({ provider, apiKey }) => listModels(provider, resolveApiKey(provider, apiKey)),
				testConnection: ({ provider, apiKey }) =>
					testConnection(provider, resolveApiKey(provider, apiKey)),
				getScreenPermission: () => ({ granted: hasScreenPermission() }),
				requestScreenPermission: () => ({ granted: requestScreenPermission() }),
				openPanel: ({ tab }) => {
					openPanel(tab ?? "chat");
					return { ok: true };
				},
				resizePet: ({ width, height }) => {
					resizePet(width, height);
					return { ok: true };
				},
				petClicked: () => ({ ok: true }),
			},
			messages: {},
		},
	});
}

// ---------- 펫 창 ----------

function createPetWindow() {
	const wa = Screen.getPrimaryDisplay().workArea;
	const x = wa.x + wa.width - PET_COMPACT.width - MARGIN;
	const y = wa.y + wa.height - PET_COMPACT.height - MARGIN;

	petWin = new BrowserWindow({
		title: "Study Pet",
		url: "views://app/pet/index.html",
		titleBarStyle: "hidden",
		transparent: true,
		frame: { ...PET_COMPACT, x, y },
		rpc: makeRPC(),
	});
	petWin.setAlwaysOnTop(true);
	petWin.setVisibleOnAllWorkspaces(true);
	petWin.on("close", () => {
		petWin = null;
	});
}

/** 오른쪽 아래 모서리를 고정한 채 크기를 바꾼다 */
function resizePet(width: number, height: number) {
	if (!petWin) return;
	const w = Math.round(Math.max(PET_COMPACT.width, Math.min(width, 480)));
	const h = Math.round(Math.max(PET_COMPACT.height, Math.min(height, 640)));
	const f = petWin.getFrame();
	if (f.width === w && f.height === h) return;
	petWin.setFrame(f.x + f.width - w, f.y + f.height - h, w, h);
}

// ---------- 패널 창 ----------

function openPanel(tab: "chat" | "settings") {
	if (panelWin) {
		panelWin.show();
		panelWin.focus();
		send("showTab", { tab }, "panel");
		return;
	}
	const wa = Screen.getPrimaryDisplay().workArea;
	const width = 440;
	const height = Math.min(680, wa.height - 2 * MARGIN);
	panelWin = new BrowserWindow({
		title: "Study Pet",
		url: `views://app/panel/index.html#${tab}`,
		titleBarStyle: "hiddenInset",
		frame: {
			width,
			height,
			x: wa.x + wa.width - width - PET_COMPACT.width - MARGIN * 2,
			y: wa.y + wa.height - height - MARGIN,
		},
		rpc: makeRPC(),
	});
	panelWin.on("close", () => {
		panelWin = null;
	});
}

// ---------- 메뉴, 트레이, 단축키 ----------

ApplicationMenu.setApplicationMenu([
	{ submenu: [{ label: "Study Pet 종료", role: "quit", accelerator: "q" }] },
	{
		label: "Edit",
		submenu: [
			{ role: "undo" },
			{ role: "redo" },
			{ type: "separator" },
			{ role: "cut" },
			{ role: "copy" },
			{ role: "paste" },
			{ role: "selectAll" },
		],
	},
]);

const tray = new Tray({ title: "🖋️" });
tray.setMenu([
	{ type: "normal", label: "잉키에게 물어보기 (⌥Space)", action: "ask" },
	{ type: "normal", label: "대화 패널 열기", action: "panel" },
	{ type: "normal", label: "설정", action: "settings" },
	{ type: "divider" },
	{ type: "normal", label: "화면 기록 권한 확인", action: "permission" },
	{ type: "divider" },
	{ type: "normal", label: "종료", action: "quit" },
]);
tray.on("tray-clicked", (event: any) => {
	switch (event?.data?.action) {
		case "ask":
			focusPetInput();
			break;
		case "panel":
			openPanel("chat");
			break;
		case "settings":
			openPanel("settings");
			break;
		case "permission": {
			const granted = hasScreenPermission() || requestScreenPermission();
			Utils.showNotification({
				title: "Study Pet",
				body: granted
					? "화면 기록 권한이 있어요."
					: "시스템 설정 > 개인정보 보호 및 보안 > 화면 기록에서 허용한 뒤 앱을 다시 실행해 주세요.",
			});
			break;
		}
		case "quit":
			tray.remove();
			Utils.quit();
			break;
	}
});

function focusPetInput() {
	if (!petWin) createPetWindow();
	petWin?.show();
	petWin?.focus();
	send("focusInput", {}, "pet");
}

const shortcut = ["Alt+Space", "CommandOrControl+Shift+Space"].find((acc) =>
	GlobalShortcut.register(acc, focusPetInput),
);
console.log(`[study-pet] 단축키: ${shortcut ?? "등록 실패"}`);

// ---------- 시작 ----------

createPetWindow();

const s = getSettings();
if (!s.provider.model) {
	// 첫 실행: 설정부터
	setTimeout(() => openPanel("settings"), 800);
}
console.log("[study-pet] 시작됨");
