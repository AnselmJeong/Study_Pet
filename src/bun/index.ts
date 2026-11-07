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
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { StudyPetRPC } from "../shared/rpc";
import type { ChatMessage, PetMood } from "../shared/types";
import * as chat from "./chat";
import * as context from "./context";
import { hasScreenPermission, requestScreenPermission } from "./capture";
import * as attach from "./attachments";
import { currentCharacter } from "./character";
import { appLog } from "./log";
import { vocative } from "../shared/character";
import { supportsVision } from "./llm/router";
import { testSearch } from "./search";
import { CLAUDE_MODELS, claudeTest } from "./llm/claudeSub";
import { listModels, testConnection } from "./llm/openaiCompat";
import { claudeApiKey, getSettings, openaiApiKey, saveSettings, setPetAnchor, setPetPackId } from "./settings";
import * as packs from "./packs";
import { INKY_ID, PACK_ID } from "../shared/pack";

const APP_NAME = "Inky";

/** 버전은 빌드가 electrobun.config.ts의 app.version으로 만든 Resources/version.json에서 읽는다 */
function appVersion(): string {
	try {
		const p = join(dirname(process.execPath), "..", "Resources", "version.json");
		const v = JSON.parse(readFileSync(p, "utf8"));
		return typeof v.version === "string" && v.version ? v.version : "?";
	} catch {
		return "?";
	}
}

function showAbout() {
	// NSAlert는 앱 아이콘(잉키)을 자동으로 같이 보여 준다
	void Utils.showMessageBox({
		type: "info",
		// macOS: title = 굵은 제목, message = 본문 (detail은 표시되지 않음)
		title: APP_NAME,
		message: `버전 ${appVersion()}\n\nDeveloped by Anselm Jeong`,
		buttons: ["확인"],
		defaultId: 0,
		cancelId: 0,
	}).catch((err) => console.error("[about]", err));
}
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
	hideForCapture: () => hideWindowsForCapture(),
});

// ---------- RPC ----------

function makeRPC() {
	return BrowserView.defineRPC<StudyPetRPC>({
		maxRequestTime: 120_000,
		handlers: {
			requests: {
				ask: async ({ text, attachments, webSearch }) => {
					const t = text.trim();
					const ids = (attachments ?? []).slice(0, attach.MAX_ATTACHMENTS);
					if (!t && !ids.length) return { accepted: false, reason: "빈 질문" };
					if (chat.isBusy()) return { accepted: false, reason: "이전 답을 쓰는 중이야" };
					const files = ids.map((id) => ({ id, path: attach.attachmentPath(id) }));
					if (files.some((f) => !f.path)) {
						return { accepted: false, reason: "첨부 이미지가 사라졌어 (오래돼서 정리됨). ✕로 빼고 다시 붙여 줘" };
					}
					if (files.length && !supportsVision("chat")) {
						return {
							accepted: false,
							reason: "지금 대화 모델은 이미지를 못 봐. 설정 → 대화에서 '비전(이미지) 지원'을 켜거나 Claude 구독으로 바꿔 줘",
						};
					}
					void chat.ask(t || "이 이미지 봐 줘", files as { id: string; path: string }[], chatEvents, webSearch ?? false);
					return { accepted: true };
				},
				addAttachment: ({ data, mime }) => attach.addFromData(data, mime),
				captureAttachment: ({ mode, from }) => captureForAttach(mode, from),
				discardAttachment: ({ id }) => {
					attach.discard(id);
					return { ok: true };
				},
				openScreenSettings: () => {
					requestScreenPermission();
					Utils.screenCapture.openSettings();
					return { ok: true };
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
				dragPet: ({ phase, dx, dy }) => {
					dragPet(phase, dx ?? 0, dy ?? 0);
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
					// 앱 기본 팩(요미 등)은 WebView만 알고 있으므로 형식만 검사한다. 잘못된 id면 잉키로
					const s = setPetPackId(id === INKY_ID || PACK_ID.test(id) ? id : INKY_ID);
					send("settingsChanged", s);
					characterChanged();
					return s;
				},
				importPack: async () => {
					const r = await packs.importPackFromDialog();
					characterChanged(); // 지금 쓰는 팩을 다시 가져왔을 수도 있다
					return r;
				},
				removePack: ({ id }) => {
					const ok = packs.removePack(id);
					characterChanged();
					return { ok };
				},
				getCharacter: () => currentCharacter(),
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

type Rect = { x: number; y: number; width: number; height: number };

/** rect가 가장 많이 걸친 화면 (안 걸치면 메인 화면) */
function displayFor(r: Rect) {
	const displays = Screen.getAllDisplays();
	let best = Screen.getPrimaryDisplay();
	let bestArea = 0;
	for (const d of displays) {
		const a = d.workArea;
		const w = Math.min(r.x + r.width, a.x + a.width) - Math.max(r.x, a.x);
		const h = Math.min(r.y + r.height, a.y + a.height) - Math.max(r.y, a.y);
		if (w > 0 && h > 0 && w * h > bestArea) {
			bestArea = w * h;
			best = d;
		}
	}
	return best;
}

/** 그 화면의 작업 영역(메뉴바·Dock 제외) 안으로 넣는다 */
function clampToWorkArea(r: Rect): Rect {
	const a = displayFor(r).workArea;
	const width = Math.min(r.width, a.width);
	const height = Math.min(r.height, a.height);
	return {
		x: Math.round(Math.max(a.x, Math.min(a.x + a.width - width, r.x))),
		y: Math.round(Math.max(a.y, Math.min(a.y + a.height - height, r.y))),
		width,
		height,
	};
}

/** 메인 화면 오른쪽 아래 자리 */
function homeFrame(width: number, height: number): Rect {
	const wa = Screen.getPrimaryDisplay().workArea;
	return { x: wa.x + wa.width - width - MARGIN, y: wa.y + wa.height - height - MARGIN, width, height };
}

/** 저장해 둔 위치 (화면 밖이면 null) */
function savedFrame(width: number, height: number): Rect | null {
	const a = getSettings().petAnchor;
	if (!a || !Number.isFinite(a.right) || !Number.isFinite(a.bottom)) return null;
	const r = { x: a.right - width, y: a.bottom - height, width, height };
	// 창 가운데가 어느 화면의 작업 영역에도 없으면 (모니터를 뺐을 때 등) 버린다
	const cx = r.x + width / 2;
	const cy = r.y + height / 2;
	const onScreen = Screen.getAllDisplays().some(
		(d) => cx >= d.workArea.x && cx < d.workArea.x + d.workArea.width && cy >= d.workArea.y && cy < d.workArea.y + d.workArea.height,
	);
	return onScreen ? clampToWorkArea(r) : null;
}

let anchorTimer: ReturnType<typeof setTimeout> | null = null;
/** 지금 펫 위치(오른쪽 아래 모서리)를 조금 뒤에 설정에 저장한다 */
function rememberPetPosition() {
	if (anchorTimer) clearTimeout(anchorTimer);
	anchorTimer = setTimeout(() => {
		anchorTimer = null;
		if (!petWin) return;
		const f = petWin.getFrame();
		setPetAnchor({ right: f.x + f.width, bottom: f.y + f.height });
	}, 800);
}

function createPetWindow(atHome = false) {
	const f = (!atHome && savedFrame(PET_COMPACT.width, PET_COMPACT.height)) || homeFrame(PET_COMPACT.width, PET_COMPACT.height);

	petWin = new BrowserWindow({
		title: APP_NAME,
		url: "views://app/pet/index.html",
		titleBarStyle: "hidden",
		transparent: true,
		frame: f,
		rpc: makeRPC(),
	});
	petWin.setAlwaysOnTop(true);
	petWin.setVisibleOnAllWorkspaces(true);
	petWin.on("close", () => {
		petWin = null;
		drag = null;
		// ⌘W 등으로 실수로 닫혀도 펫이 사라지지 않게 다시 띄운다 (저장한 자리로)
		if (!quitting) setTimeout(() => !petWin && !quitting && createPetWindow(), 800);
	});
}

/** 지금 창의 오른쪽 아래 모서리를 고정한 채 크기를 바꾸고, 그 화면 작업 영역 안으로 넣는다 */
function resizePet(width: number, height: number) {
	if (!petWin) return;
	const w = Math.round(Math.max(PET_COMPACT.width, Math.min(width, 480)));
	const h = Math.round(Math.max(PET_COMPACT.height, Math.min(height, 640)));
	const f = petWin.getFrame();
	if (f.width === w && f.height === h) return;
	const r = clampToWorkArea({ x: f.x + f.width - w, y: f.y + f.height - h, width: w, height: h });
	petWin.setFrame(r.x, r.y, r.width, r.height);
}

// 드래그 중이면 걷기를 멈추고, 걷는 중에 드래그가 시작돼도 걷기가 위치를 덮어쓰지 않게 한다
let drag: { x: number; y: number } | null = null;
let walkSeq = 0;

function dragPet(phase: "start" | "move" | "end", dx: number, dy: number) {
	if (!petWin) return;
	if (phase === "start") {
		walkSeq++; // 걷던 중이면 멈춘다
		const f = petWin.getFrame();
		drag = { x: f.x, y: f.y };
		return;
	}
	if (!drag) return;
	if (phase === "move") {
		if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
		petWin.setPosition(Math.round(drag.x + dx), Math.round(drag.y + dy));
		return;
	}
	// end: 놓은 자리의 화면 작업 영역 안으로 넣고 저장한다
	drag = null;
	const f = petWin.getFrame();
	const r = clampToWorkArea(f);
	if (r.x !== f.x || r.y !== f.y) petWin.setPosition(r.x, r.y);
	rememberPetPosition();
}

async function walkPet(dx: number, durationMs: number) {
	if (!petWin || drag) return;
	const seq = ++walkSeq;
	const f = petWin.getFrame();
	// 지금 있는 화면 안에서만, 지금 자리 기준으로 옆으로 걷는다
	const a = displayFor(f).workArea;
	const target = Math.max(a.x, Math.min(a.x + a.width - f.width, f.x + dx));
	const steps = Math.max(1, Math.round(Math.min(durationMs, 4000) / 33));
	for (let i = 1; i <= steps; i++) {
		if (!petWin || drag || seq !== walkSeq) return;
		const cur = petWin.getFrame();
		petWin.setPosition(Math.round(cur.x + (target - cur.x) / (steps - i + 1)), cur.y);
		await Bun.sleep(33);
	}
	if (seq === walkSeq) rememberPetPosition();
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
		title: panelTitle(),
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

// ---------- 캐릭터 이름 ----------

function panelTitle() {
	return `${currentCharacter().name} · ${APP_NAME}`;
}

/** 캐릭터가 바뀌면 메뉴, 패널 제목, 창들의 이름 표시를 바로 바꾼다 */
function characterChanged() {
	const c = currentCharacter();
	send("characterChanged", c);
	updateTrayMenu();
	try {
		panelWin?.setTitle(panelTitle());
	} catch {}
}

// ---------- 첨부용 화면 캡처 ----------

let attachCapturing = false;

/** 캡처에 펫·패널이 찍히지 않게 숨기고, 다시 보이게 하는 함수를 돌려준다.
 *  focusFrom이 없으면(펫이 먼저 말 걸 때) 포커스를 가져오지 않는다 */
async function hideWindowsForCapture(focusFrom?: "pet" | "panel"): Promise<() => void> {
	const petShown = Boolean(petWin?.isVisible());
	const panelShown = Boolean(panelWin?.isVisible());
	petWin?.hide();
	panelWin?.hide();
	await Bun.sleep(250); // 창이 실제로 사라질 때까지
	return () => {
		if (petShown && petWin) {
			petWin.show();
			petWin.setAlwaysOnTop(true);
		}
		if (panelShown && panelWin) panelWin.show();
		if (focusFrom) (focusFrom === "panel" && panelShown ? panelWin : petWin)?.focus();
	};
}

/** 펫(과 패널)을 숨기고 찍은 다음, 원래대로 보이게 한다 */
async function captureForAttach(mode: "screen" | "region", from: "pet" | "panel") {
	if (attachCapturing) return { ok: false as const, reason: "failed" as const, message: "이미 찍는 중이야" };
	attachCapturing = true;
	try {
		return await attach.addFromCapture(mode, () => hideWindowsForCapture(from));
	} finally {
		attachCapturing = false;
	}
}

/** 트레이·우클릭 "영역 찍어서 물어보기": 찍은 그림을 펫 입력창에 붙이고 연다 */
async function regionAsk() {
	if (!petWin) createPetWindow();
	const r = await captureForAttach("region", "pet");
	if (r.ok) {
		send("attachmentAdded", r.attachment, "pet");
		focusPetInput();
	} else if (r.reason === "permission" || r.reason === "failed") {
		send("attachmentError", { reason: r.reason, message: r.message ?? "캡처 실패" }, "pet");
		focusPetInput();
	}
}

// ---------- 메뉴, 트레이, 단축키 ----------

ApplicationMenu.setApplicationMenu([
	{
		submenu: [
			{ label: "Inky에 관하여", action: "about" },
			{ type: "separator" },
			{ label: "Inky 종료", role: "quit", accelerator: "q" },
		],
	},
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

// 트레이: 제목은 늘 🖋️, 공부 세션 중이면 왼쪽에 색 점 이미지 (기록 중 빨강, 일시정지 주황).
// template: false 여야 점 색이 메뉴 막대에서 그대로 보인다. 이미지는 build.copy의 assets/tray.
const TRAY_DOT = { rec: "views://app/tray/rec.png", paused: "views://app/tray/paused.png" } as const;
const tray = new Tray({ title: "🖋️", template: false, width: 18, height: 18 });
let trayDot: keyof typeof TRAY_DOT | "" = "";

function updateTrayIcon() {
	const st = context.getState();
	const want = !st.running ? "" : st.paused ? "paused" : "rec";
	if (want === trayDot) return;
	trayDot = want;
	tray.setImage(want ? TRAY_DOT[want] : "");
}

function updateTrayMenu() {
	const running = context.getState().running;
	const name = currentCharacter().name;
	updateTrayIcon();
	tray.setMenu([
		{ type: "normal", label: `${name}에게 물어보기 (⌥Space)`, action: "ask" },
		{ type: "normal", label: "영역 찍어서 물어보기", action: "region-ask" },
		{ type: "normal", label: `${name} 불러오기 (오른쪽 아래로)`, action: "summon" },
		{ type: "normal", label: `${vocative(name)}, 한마디 해 줘`, action: "speak" },
		{ type: "normal", label: running ? "공부 세션 끝내기 (화면 기록 중지)" : "공부 세션 시작 (1분마다 화면 기록)", action: "toggle-session" },
		{ type: "divider" },
		{ type: "normal", label: "대화 패널", action: "panel" },
		{ type: "normal", label: "화면 기록 타임라인", action: "timeline" },
		{ type: "normal", label: "설정", action: "settings" },
		{ type: "divider" },
		{ type: "normal", label: "화면 기록 권한 확인", action: "permission" },
		{ type: "normal", label: "Inky에 관하여", action: "about" },
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
		case "region-ask":
			void regionAsk();
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
		case "about":
			showAbout();
			break;
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
	const name = currentCharacter().name;
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
		{ type: "normal", label: "영역 찍어서 물어보기", action: "region-ask" },
		{ type: "normal", label: "대화 패널", action: "panel" },
		{ type: "normal", label: "화면 기록 타임라인", action: "timeline" },
		{ type: "normal", label: "설정", action: "settings" },
		{ type: "divider" },
		{ type: "normal", label: running ? "공부 세션 끝내기" : "공부 세션 시작", action: "toggle-session" },
		{ type: "normal", label: `${vocative(name)}, 한마디 해 줘`, action: "speak" },
		{ type: "normal", label: `${name} 불러오기 (오른쪽 아래로)`, action: "summon" },
		{ type: "divider" },
		{ type: "normal", label: "Inky에 관하여", action: "about" },
		{ type: "normal", label: "종료", action: "quit" },
	]);
}

ContextMenu.on("context-menu-clicked", (event: any) => runMenuAction(event?.data?.action));
ApplicationMenu.on("application-menu-clicked", (event: any) => runMenuAction(event?.data?.action));

/** 펫 창이 닫혔거나 화면 밖에 있으면 메인 화면 오른쪽 아래로 다시 데려온다 */
function summonPet() {
	if (!petWin) {
		createPetWindow(true);
		rememberPetPosition();
		return;
	}
	// 드래그·걷기 상태를 모두 끊고 메인 화면 오른쪽 아래로. 이후에는 다시 자유롭게 옮길 수 있다
	drag = null;
	walkSeq++;
	send("petDragReset", {}, "pet");
	const f = petWin.getFrame();
	const r = homeFrame(f.width, f.height);
	petWin.setFrame(r.x, r.y, r.width, r.height);
	petWin.setAlwaysOnTop(true);
	petWin.show();
	rememberPetPosition();
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

// 화면 기록 권한이 없으면 (재설치하면 ad-hoc 서명이 바뀌어 권한이 풀린다) 한 번 알려 준다
const screenOk = hasScreenPermission();
console.log(`[study-pet] 화면 기록 권한: ${screenOk ? "있음" : "없음"}`);
// 진단용: 실행할 때마다 권한 상태를 남긴다 (userData/inky.log)
appLog(`start v${appVersion()} screenPermission=${screenOk}`);
if (!screenOk) {
	setTimeout(() => {
		const line =
			"화면 기록 권한이 꺼져 있어서 지금은 화면을 못 봐. 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Inky를 껐다 켜고 앱을 다시 실행해 줘. (메뉴바 🖋️ → 화면 기록 권한 확인)";
		chat.addPetLine(line, chatEvents);
		send("petSays", { text: line, kind: "nudge" });
	}, 2500);
}

const s = getSettings();
if (s.chatProvider === "openai-compat" && !s.openai.chatModel) {
	setTimeout(() => openPanel("settings"), 800);
}
console.log("[study-pet] 시작됨");
