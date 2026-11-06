import {
	ApplicationMenu,
	BrowserView,
	ContextMenu,
	BrowserWindow,
	GlobalShortcut,
	Screen,
	Tray,
	Utils,
} from "electrobun/main";
import type { StudyPetRPC } from "../shared/rpc";
import type { ChatMessage, PetMood } from "../shared/types";
import * as chat from "./chat";
import * as context from "./context";
import { hasScreenPermission, requestScreenPermission } from "./capture";
import { testSearch } from "./search";
import { CLAUDE_MODELS, claudeTest } from "./llm/claudeSub";
import { listModels, testConnection } from "./llm/openaiCompat";
import { claudeApiKey, getSettings, openaiApiKey, saveSettings, setPetPackId } from "./settings";
import * as packs from "./packs";

const APP_NAME = "Inky";
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

context.init({
	timelineAdded: (e) => send("timelineAdded", e),
	captureState: (st) => {
		send("captureState", st);
		updateTrayMenu();
	},
	petSays: (text, kind) => {
		chat.addPetLine(text, chatEvents);
		send("petSays", { text, kind });
	},
	mood: (mood) => send("mood", { mood }),
	isChatBusy: () => chat.isBusy(),
});

// ---------- RPC ----------

function makeRPC() {
	return BrowserView.defineRPC<StudyPetRPC>({
		maxRequestTime: 120_000,
		handlers: {
			requests: {
				ask: async ({ text, attachScreen, webSearch }) => {
					const t = text.trim();
					if (!t) return { accepted: false, reason: "빈 질문" };
					if (chat.isBusy()) return { accepted: false, reason: "이전 답을 쓰는 중이야" };
					void chat.ask(t, attachScreen, chatEvents, webSearch ?? false);
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
				saveSettings: ({ settings, apiKeys }) => {
					const s = saveSettings(settings, apiKeys);
					context.rescheduleProactive();
					send("settingsChanged", s);
					return s;
				},
				listModels: async ({ provider, settings, apiKey }) =>
					provider === "claude-sub"
						? { ok: true, models: CLAUDE_MODELS }
						: listModels(settings.openai, openaiApiKey(settings.openai, apiKey)),
				testConnection: ({ provider, settings, apiKey }) =>
					provider === "claude-sub"
						? claudeTest(settings.claude, claudeApiKey(apiKey))
						: testConnection(settings.openai, openaiApiKey(settings.openai, apiKey)),
				testSearch: ({ apiKey }) => testSearch(apiKey),
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
				walkPet: async ({ dx, durationMs }) => {
					await walkPet(dx, durationMs);
					return { ok: true };
				},
				getCaptureState: () => context.getState(),
				startCapture: ({ goal }) => {
					context.start(goal);
					return context.getState();
				},
				stopCapture: () => {
					context.stop();
					return context.getState();
				},
				getTimeline: () => context.getTimeline(),
				listPacks: () => packs.listUserPacks(),
				getPack: ({ id }) => ({ pack: packs.getPack(id) }),
				setPetPack: ({ id }) => {
					const s = setPetPackId(id);
					send("settingsChanged", s);
					return s;
				},
				importPack: () => packs.importPackFromDialog(),
				removePack: ({ id }) => ({ ok: packs.removePack(id) }),
				openPacksFolder: () => {
					packs.openPacksFolder();
					return { ok: true };
				},
				showContextMenu: ({ where, editable, hasSelection }) => {
					showAppContextMenu(where, Boolean(editable), Boolean(hasSelection));
					return { ok: true };
				},
			},
			messages: {},
		},
	});
}

// ---------- 펫 창 ----------

let quitting = false;

function createPetWindow() {
	const wa = Screen.getPrimaryDisplay().workArea;
	const x = wa.x + wa.width - PET_COMPACT.width - MARGIN;
	const y = wa.y + wa.height - PET_COMPACT.height - MARGIN;

	petWin = new BrowserWindow({
		title: APP_NAME,
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
		// ⌘W 등으로 실수로 닫혀도 잉키가 사라지지 않게 다시 띄운다
		if (!quitting) setTimeout(() => !petWin && !quitting && createPetWindow(), 800);
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

let walking = false;
async function walkPet(dx: number, durationMs: number) {
	if (!petWin || walking) return;
	walking = true;
	try {
		const wa = Screen.getPrimaryDisplay().workArea;
		const f = petWin.getFrame();
		const target = Math.max(wa.x, Math.min(wa.x + wa.width - f.width, f.x + dx));
		const steps = Math.max(1, Math.round(Math.min(durationMs, 4000) / 33));
		for (let i = 1; i <= steps; i++) {
			if (!petWin) break;
			const cur = petWin.getFrame();
			petWin.setPosition(Math.round(f.x + ((target - f.x) * i) / steps), cur.y);
			await Bun.sleep(33);
		}
	} finally {
		walking = false;
	}
}

// ---------- 패널 창 ----------

function openPanel(tab: "chat" | "timeline" | "settings") {
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
		title: APP_NAME,
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
	{ submenu: [{ label: "Inky 종료", role: "quit", accelerator: "q" }] },
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

function updateTrayMenu() {
	const running = context.getState().running;
	tray.setTitle(running ? "🖋️●" : "🖋️");
	tray.setMenu([
		{ type: "normal", label: "잉키에게 물어보기 (⌥Space)", action: "ask" },
		{ type: "normal", label: "잉키 불러오기 (오른쪽 아래로)", action: "summon" },
		{ type: "normal", label: "잉키야, 한마디 해 줘", action: "speak" },
		{ type: "normal", label: running ? "공부 세션 끝내기 (화면 기록 중지)" : "공부 세션 시작 (1분마다 화면 기록)", action: "toggle-session" },
		{ type: "divider" },
		{ type: "normal", label: "대화 패널", action: "panel" },
		{ type: "normal", label: "화면 기록 타임라인", action: "timeline" },
		{ type: "normal", label: "설정", action: "settings" },
		{ type: "divider" },
		{ type: "normal", label: "화면 기록 권한 확인", action: "permission" },
		{ type: "divider" },
		{ type: "normal", label: "종료", action: "quit" },
	]);
}
updateTrayMenu();

/** 트레이 메뉴와 우클릭 메뉴가 같이 쓰는 동작 */
function runMenuAction(action: string | undefined) {
	switch (action) {
		case "ask":
			focusPetInput();
			break;
		case "summon":
			summonPet();
			break;
		case "speak":
			void context.speakNow();
			break;
		case "toggle-session":
			if (context.getState().running) context.stop();
			else context.start("");
			break;
		case "panel":
			openPanel("chat");
			break;
		case "timeline":
			openPanel("timeline");
			break;
		case "settings":
			openPanel("settings");
			break;
		case "permission": {
			const granted = hasScreenPermission() || requestScreenPermission();
			Utils.showNotification({
				title: APP_NAME,
				body: granted
					? "화면 기록 권한이 있어요."
					: "시스템 설정 > 개인정보 보호 및 보안 > 화면 기록에서 허용한 뒤 앱을 다시 실행해 주세요.",
			});
			break;
		}
		case "quit":
			quitting = true;
			context.stop();
			tray.remove();
			Utils.quit();
			break;
	}
}

tray.on("tray-clicked", (event: any) => runMenuAction(event?.data?.action));

function showAppContextMenu(_where: "pet" | "panel", editable: boolean, hasSelection: boolean) {
	const running = context.getState().running;
	const edit: any[] =
		editable || hasSelection
			? [
					...(editable ? [{ role: "cut" }] : []),
					{ role: "copy" },
					...(editable ? [{ role: "paste" }] : []),
					{ role: "selectAll" },
					{ type: "divider" },
				]
			: [];
	ContextMenu.showContextMenu([
		...edit,
		{ type: "normal", label: "물어보기 (⌥Space)", action: "ask" },
		{ type: "normal", label: "대화 패널", action: "panel" },
		{ type: "normal", label: "화면 기록 타임라인", action: "timeline" },
		{ type: "normal", label: "설정", action: "settings" },
		{ type: "divider" },
		{ type: "normal", label: running ? "공부 세션 끝내기" : "공부 세션 시작", action: "toggle-session" },
		{ type: "normal", label: "잉키야, 한마디 해 줘", action: "speak" },
		{ type: "normal", label: "잉키 불러오기 (오른쪽 아래로)", action: "summon" },
		{ type: "divider" },
		{ type: "normal", label: "종료", action: "quit" },
	]);
}

ContextMenu.on("context-menu-clicked", (event: any) => runMenuAction(event?.data?.action));

/** 펫 창이 닫혔거나 화면 밖에 있으면 메인 화면 오른쪽 아래로 다시 데려온다 */
function summonPet() {
	if (!petWin) {
		createPetWindow();
		return;
	}
	const wa = Screen.getPrimaryDisplay().workArea;
	const f = petWin.getFrame();
	petWin.setFrame(wa.x + wa.width - f.width - MARGIN, wa.y + wa.height - f.height - MARGIN, f.width, f.height);
	petWin.setAlwaysOnTop(true);
	petWin.show();
}

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

// 메뉴 막대 앱(LSUIElement)으로 동작: Dock 아이콘을 숨긴다. Info.plist의 LSUIElement와 함께 이중 안전장치.
try {
	Utils.setDockIconVisible(false);
} catch (err) {
	console.error("[study-pet] Dock 아이콘 숨기기 실패", err);
}

createPetWindow();

const s = getSettings();
if (s.chatProvider === "openai-compat" && !s.openai.chatModel) {
	setTimeout(() => openPanel("settings"), 800);
}
console.log("[study-pet] 시작됨");
