// 공부 세션 동안 주기적으로 화면을 캡처하고, 요약 모델(기본: Claude Sonnet)로 한 줄 요약을 만들어
// 타임라인에 쌓는다. 스크린샷은 링버퍼(개수 + 보관 시간)로 지우고, 텍스트 요약은 남긴다.
// 같은 루프에서 펫이 먼저 말을 거는 일(격려, 농담, 휴식 권유, 부드러운 복귀 제안)도 맡는다.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity, CaptureState, PetMood, Relevance, TimelineEntry } from "../shared/types";
import { currentCharacter } from "./character";
import { personaLines } from "./llm/prompt";
import {
	captureScreen,
	deleteShot,
	fingerprint,
	fingerprintDiff,
	frontmostApp,
	hasScreenPermission,
	idleSeconds,
	screenLocked,
} from "./capture";
import { appLog } from "./log";
import { complete, supportsVision } from "./llm/router";
import { dataDir, getSettings } from "./settings";

const timelinePath = join(dataDir, "timeline.jsonl");
const MAX_TIMELINE_MEM = 300;
const TIMELINE_KEEP_DAYS = 30;

export type ContextEvents = {
	timelineAdded: (e: TimelineEntry) => void;
	captureState: (s: CaptureState) => void;
	petSays: (text: string, kind: "encourage" | "joke" | "break" | "nudge") => void;
	mood: (m: PetMood) => void;
	/** 사용자가 질문 중이거나 답을 받는 중이면 펫이 먼저 말을 걸지 않는다 */
	isChatBusy: () => boolean;
	/** 펫·패널을 숨기고(캡처에 안 찍히게), 다시 보이게 하는 함수를 돌려준다 */
	hideForCapture: () => Promise<() => void>;
};

/** 말 걸기·질문에 넘기는 화면 기록은 이 시간 안의 것만 (몇 시간 전 공부 내용을 끌어오지 않게) */
export const RECENT_CONTEXT_MS = 15 * 60_000;

let ev: ContextEvents | null = null;
const state: CaptureState = { running: false, paused: false, goal: "", startedAt: null, lastCaptureAt: null };

/** 화면이 "같다"고 보는 지문 차이 기준 (0~255) */
const SAME_SCREEN_DIFF = 2.5;
let lastFp: Uint8Array | null = null;
let pausePoll: ReturnType<typeof setInterval> | null = null;
let timeline: TimelineEntry[] = loadTimeline();
let captureTimer: ReturnType<typeof setTimeout> | null = null;
let proactiveTimer: ReturnType<typeof setTimeout> | null = null;
let capturing = false;
let nudgesThisHour: number[] = [];
let lastNudgeAt = 0;

function newId() {
	return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function loadTimeline(): TimelineEntry[] {
	if (!existsSync(timelinePath)) return [];
	const cutoff = Date.now() - TIMELINE_KEEP_DAYS * 86_400_000;
	const lines = readFileSync(timelinePath, "utf8").split("\n").filter(Boolean);
	const entries: TimelineEntry[] = [];
	for (const l of lines) {
		try {
			const e = JSON.parse(l) as TimelineEntry;
			if (e.ts >= cutoff) entries.push(e);
		} catch {}
	}
	// 오래된 줄은 파일에서도 지운다
	if (entries.length !== lines.length) {
		writeFileSync(timelinePath, entries.map((e) => JSON.stringify(e)).join("\n") + (entries.length ? "\n" : ""));
	}
	return entries.slice(-MAX_TIMELINE_MEM);
}

function addEntry(e: TimelineEntry) {
	timeline.push(e);
	if (timeline.length > MAX_TIMELINE_MEM) timeline = timeline.slice(-MAX_TIMELINE_MEM);
	const { shotPath: _drop, ...persisted } = e;
	appendFileSync(timelinePath, JSON.stringify(persisted) + "\n");
	ev?.timelineAdded(e);
}

export function init(events: ContextEvents) {
	ev = events;
	scheduleProactive();
}

export function getState(): CaptureState {
	return { ...state };
}

export function getTimeline(): TimelineEntry[] {
	return timeline;
}

/** 질문 답변용: 최근 n개의 요약 텍스트. maxAgeMs를 주면 그보다 오래된 기록은 뺀다 (타임라인 자체는 그대로) */
export function recentSummaries(n = 20, maxAgeMs?: number): string {
	const cutoff = maxAgeMs ? Date.now() - maxAgeMs : 0;
	const recent = timeline.filter((e) => !e.skipped && !e.error && e.ts >= cutoff).slice(-n);
	if (!recent.length) return "";
	return recent
		.map((e) => {
			const t = new Date(e.ts).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false });
			return `- ${t} [${e.app || "?"}] ${e.summary} (${e.relevance})`;
		})
		.join("\n");
}

export function start(goal: string) {
	state.running = true;
	state.paused = false;
	lastFp = null;
	state.goal = goal.trim();
	state.startedAt = Date.now();
	captureFailures = 0;
	warnedCaptureFail = false;
	ev?.captureState(getState());
	ev?.mood("focus");
	void tick(); // 바로 첫 캡처
	scheduleProactive(); // 세션 안 간격으로
}

export function stop() {
	state.running = false;
	state.paused = false;
	state.startedAt = null;
	if (pausePoll) clearInterval(pausePoll);
	pausePoll = null;
	if (captureTimer) clearTimeout(captureTimer);
	captureTimer = null;
	ev?.captureState(getState());
	ev?.mood("idle");
	scheduleProactive(); // 세션 밖 간격으로
}

/** 입력이 없으면(영상 시청, 자리 비움) 간격을 늘려서 캡처와 요약 호출을 줄인다 */
function scheduleNext(idle = false) {
	if (!state.running) return;
	if (captureTimer) clearTimeout(captureTimer);
	const c = getSettings().capture;
	const sec = idle ? Math.max(c.intervalSec, c.idleIntervalMin * 60) : c.intervalSec;
	captureTimer = setTimeout(() => void tick(), sec * 1000);
}

function pauseUntilActive(reason: "idle" | "lock") {
	state.paused = true;
	ev?.captureState(getState());
	ev?.mood("idle");
	addEntry({
		id: newId(),
		ts: Date.now(),
		app: "",
		summary:
			reason === "lock"
				? "화면이 잠겨 기록을 잠시 멈춤"
				: `입력과 화면 변화가 ${getSettings().capture.autoPauseMin}분 넘게 없어 기록을 잠시 멈춤`,
		activity: "other",
		relevance: "break",
		keyTerms: [],
		skipped: "auto-pause",
	});
	if (pausePoll) clearInterval(pausePoll);
	pausePoll = setInterval(() => {
		if (!state.running) return;
		if (!screenLocked() && idleSeconds() < 10) {
			if (pausePoll) clearInterval(pausePoll);
			pausePoll = null;
			state.paused = false;
			lastFp = null;
			ev?.captureState(getState());
			ev?.mood("focus");
			if (!ev?.isChatBusy()) ev?.petSays("다시 왔네! 기록 다시 시작할게.", "encourage");
			void tick();
		}
	}, 5_000);
}

let captureFailures = 0;
let warnedCaptureFail = false;

async function tick() {
	if (!state.running || state.paused) return;
	if (capturing) return scheduleNext();
	capturing = true;
	let paused = false;
	let idle = false;
	try {
		const s = getSettings();
		if (screenLocked()) {
			paused = true;
			pauseUntilActive("lock");
			return;
		}
		const app = frontmostApp();
		const base = { id: newId(), ts: Date.now(), app, summary: "", activity: "other" as Activity, keyTerms: [] };
		const idleSec = idleSeconds();
		idle = idleSec > s.capture.idleSkipSec;

		const excluded = s.capture.excludedApps.find((x) => x && app.toLowerCase().includes(x.toLowerCase()));
		if (excluded) {
			addEntry({ ...base, relevance: "unknown", summary: `제외 앱 사용 중 (${app})`, skipped: "excluded" });
			return;
		}
		const shot = await captureScreen();
		if (!shot) {
			addEntry({ ...base, relevance: "unknown", summary: "캡처 실패 (화면 기록 권한 확인)", skipped: "no-permission" });
			captureFailures++;
			// 연속으로 실패하면 타임라인에만 남기지 말고 펫이 직접 알려 준다 (세션마다 한 번)
			if (captureFailures >= 3 && !warnedCaptureFail) {
				warnedCaptureFail = true;
				ev?.mood("error");
				ev?.petSays(
					"화면 캡처가 계속 실패하고 있어. 화면 기록 권한이 꺼진 것 같아 → 시스템 설정 → 개인정보 보호 및 보안 → 화면 및 시스템 오디오 녹음에서 Inky를 껐다 켜고 앱을 다시 실행해 줘.",
					"nudge",
				);
			}
			return;
		}
		captureFailures = 0;

		// 화면 변화 비교
		const fp = await fingerprint(shot.path);
		const diff = fingerprintDiff(fp, lastFp);
		const same = diff < SAME_SCREEN_DIFF;
		if (fp) lastFp = fp;

		if (same) {
			// 같은 화면: 저장하지 않고 직전 기록이 이어진 것으로 처리 (요약 호출도 안 함)
			deleteShot(shot.path);
			const prev = timeline[timeline.length - 1];
			if (prev && !prev.skipped) prev.repeats = (prev.repeats ?? 0) + 1;
			// 입력도 화면 변화도 없이 autoPauseMin이 지나면 자동 일시정지
			if (idleSec >= s.capture.autoPauseMin * 60) {
				paused = true;
				pauseUntilActive("idle");
			}
			return;
		}

		// 입력은 없지만 화면이 바뀌는 경우(강의 영상 등)는 계속 기록한다
		state.lastCaptureAt = shot.ts;
		ev?.captureState(getState());

		if (!supportsVision("summary", s)) {
			addEntry({ ...base, ts: shot.ts, shotPath: shot.path, relevance: "unknown", summary: "(요약 모델이 이미지를 못 봄)" });
			return;
		}
		try {
			const { sensitive, ...parsed } = await summarize(shot.path, app, idle);
			if (sensitive) {
				// 민감한 화면: 스크린샷을 바로 지우고 경로도 남기지 않는다
				deleteShot(shot.path);
				addEntry({ ...base, ts: shot.ts, ...parsed, summary: "민감한 화면(내용 생략)", keyTerms: [] });
			} else {
				addEntry({ ...base, ts: shot.ts, shotPath: shot.path, ...parsed });
			}
			maybeNudge();
		} catch (err) {
			addEntry({
				...base,
				ts: shot.ts,
				shotPath: shot.path,
				relevance: "unknown",
				summary: "요약 실패",
				error: String(err).slice(0, 200),
			});
		}
	} finally {
		capturing = false;
		if (!paused) scheduleNext(idle);
	}
}

const ACTIVITIES: Activity[] = ["reading", "writing", "coding", "searching", "video", "chat", "other"];
const RELEVANCES: Relevance[] = ["on_task", "related", "off_task", "break"];

async function summarize(
	shotPath: string,
	app: string,
	idle: boolean,
): Promise<Pick<TimelineEntry, "summary" | "activity" | "relevance" | "keyTerms"> & { sensitive: boolean }> {
	const prev = timeline
		.filter((e) => !e.skipped && !e.error)
		.slice(-3)
		.map((e) => `- ${e.summary}`)
		.join("\n");
	const goal = state.goal || "(목표를 정하지 않음. 화면을 보고 공부/연구 중인지 판단)";
	const text = await complete("summary", {
		system:
			"너는 사용자의 화면 스크린샷을 보고 지금 무엇을 하고 있는지 기록하는 도우미다. 반드시 JSON 객체 하나만 출력한다. 설명이나 코드펜스는 쓰지 않는다.",
		history: [],
		images: [shotPath],
		maxTokens: 400,
		userText: [
			`세션 목표: ${goal}`,
			`맨 앞 앱: ${app || "알 수 없음"}`,
			idle ? "참고: 최근 몇 분간 키보드/마우스 입력이 없었음 (영상 시청이나 읽기일 수 있음)" : "",
			prev ? `직전 요약:\n${prev}` : "",
			"",
			"다음 형식의 JSON만 출력해:",
			`{"summary": "한국어 한 문장. 구체적으로 (예: 'Friston 2010 PDF 6쪽, 식 (3) 자유에너지 분해를 읽는 중')",`,
			`  "activity": one of ${JSON.stringify(ACTIVITIES)},`,
			`  "relevance": one of ${JSON.stringify(RELEVANCES)} (목표와 직접 관련=on_task, 참고자료 검색 등 간접 관련=related, 무관=off_task, 쉬는 중=break),`,
			`  "keyTerms": ["화면에 보이는 핵심 용어 최대 5개"],`,
			`  "sensitive": true 또는 false (비밀번호, 금융·결제 정보, 개인 메시지 내용이 보이면 true)}`,
			"sensitive가 true이면 summary에 내용을 적지 말고 '민감한 화면'으로만 쓰고 keyTerms는 비워.",
		]
			.filter(Boolean)
			.join("\n"),
	});
	const m = text.match(/\{[\s\S]*\}/);
	if (!m) throw new Error(`JSON 없음: ${text.slice(0, 120)}`);
	const j = JSON.parse(m[0]);
	return {
		summary: String(j.summary ?? "").slice(0, 300) || "(빈 요약)",
		activity: ACTIVITIES.includes(j.activity) ? j.activity : "other",
		relevance: RELEVANCES.includes(j.relevance) ? j.relevance : "unknown",
		keyTerms: Array.isArray(j.keyTerms) ? j.keyTerms.slice(0, 5).map(String) : [],
		sensitive: j.sensitive === true || /민감한 화면/.test(String(j.summary ?? "")),
	};
}

// ---------- 펫이 먼저 말 걸기 ----------

/** 최근 8분 중 5분 이상 off_task면 부드럽게 복귀 제안 (시간당 최대 3회, 10분 쿨다운) */
function maybeNudge() {
	if (!state.running || ev?.isChatBusy()) return;
	const now = Date.now();
	nudgesThisHour = nudgesThisHour.filter((t) => now - t < 3_600_000);
	if (nudgesThisHour.length >= 3 || now - lastNudgeAt < 10 * 60_000) return;
	const interval = getSettings().capture.intervalSec * 1000;
	const window = timeline.filter((e) => now - e.ts <= Math.max(8 * 60_000, interval * 8));
	const count = (arr: TimelineEntry[]) => arr.reduce((a, e) => a + 1 + (e.repeats ?? 0), 0);
	const off = count(window.filter((e) => e.relevance === "off_task"));
	if (count(window) >= 5 && off >= 5) {
		const anchor = [...timeline].reverse().find((e) => e.relevance === "on_task");
		lastNudgeAt = now;
		nudgesThisHour.push(now);
		void speak("nudge", anchor ? `복귀 지점: ${anchor.summary}` : "");
	}
}

function scheduleProactive() {
	if (proactiveTimer) clearTimeout(proactiveTimer);
	const p = getSettings().proactive;
	// 세션 밖에서는 더 긴 간격 (기본 20~40분)
	const lo = state.running ? p.minIntervalMin : p.offMinIntervalMin;
	const hi = state.running ? p.maxIntervalMin : p.offMaxIntervalMin;
	const min = Math.max(3, lo);
	const max = Math.max(min, hi);
	const delay = (min + Math.random() * (max - min)) * 60_000;
	proactiveTimer = setTimeout(() => {
		void proactiveTick().finally(scheduleProactive);
	}, delay);
}

/** 설정이 바뀌면 다음 말 걸기 시점을 다시 잡는다 */
export function rescheduleProactive() {
	scheduleProactive();
}

type SpeakKind = "encourage" | "joke" | "break" | "nudge";

/** 지금 말을 걸면 안 되는 이유 (없으면 null). 화면을 찍기 전에 확인한다 */
function proactiveBlock(): string | null {
	if (ev?.isChatBusy()) return "chat-busy";
	if (screenLocked()) return "locked";
	if (idleSeconds() > 5 * 60) return "idle";
	if (!hasScreenPermission()) return "no-permission";
	const app = frontmostApp();
	const excluded = getSettings().capture.excludedApps.find((x) => x && app.toLowerCase().includes(x.toLowerCase()));
	if (excluded) return "excluded-app";
	return null;
}

let oneOffBusy = false;

/** 말 걸기용으로 지금 화면을 한 장 찍는다. 타임라인·세션 통계에는 넣지 않고, 다 쓰면 바로 지운다 */
async function captureOneOff(): Promise<string | null> {
	if (oneOffBusy || !ev) return null;
	oneOffBusy = true;
	let restore: (() => void) | null = null;
	try {
		restore = await ev.hideForCapture();
		const shot = await captureScreen(); // screencapture + sips -Z 1568
		return shot?.path ?? null;
	} catch (err) {
		console.error("[proactive] 캡처 실패", err);
		return null;
	} finally {
		restore?.();
		oneOffBusy = false;
	}
}

/** 메뉴에서 바로 말 걸기 (격려 또는 농담). 지금 화면을 보고 한다 */
export async function speakNow() {
	const block = proactiveBlock();
	// 직접 부른 것이니 잠금·입력 없음은 무시하지만, 대화 중이면 끼어들지 않는다
	if (block === "chat-busy") return;
	const kind: SpeakKind = getSettings().proactive.jokes && Math.random() < 0.4 ? "joke" : "encourage";
	// 제외 앱이거나 권한이 없으면 화면 없이 가볍게 한마디만
	const canLook = block !== "excluded-app" && block !== "no-permission";
	await speakWithFreshShot(kind, "", canLook, "menu");
}

async function proactiveTick() {
	const p = getSettings().proactive;
	if (!p.enabled) return;
	if (!state.running && !p.offSession) return;
	const block = proactiveBlock();
	if (block) {
		appLog(`proactive skip reason=${block} session=${state.running}`);
		return;
	}
	const minutes = state.startedAt ? (Date.now() - state.startedAt) / 60_000 : 0;
	let kind: SpeakKind;
	if (state.running && minutes > 50 && Math.random() < 0.6) kind = "break";
	else if (p.jokes && Math.random() < 0.35) kind = "joke";
	else kind = "encourage";
	await speakWithFreshShot(kind, "", true, "timer");
}

/** 지금 화면을 찍어 넘기고, 말한 뒤에는 바로 지운다 */
async function speakWithFreshShot(kind: SpeakKind, extra: string, look: boolean, via: string) {
	const s = getSettings();
	const shot = look && supportsVision("summary", s) ? await captureOneOff() : null;
	appLog(`proactive ${via} kind=${kind} session=${state.running} shot=${shot ? "captured" : "none"}`);
	try {
		await speak(kind, extra, shot);
	} finally {
		if (shot) {
			deleteShot(shot);
			appLog(`proactive shot deleted=${!existsSync(shot)}`);
		}
	}
}

async function speak(kind: SpeakKind, extra: string, shotPath: string | null = null) {
	const s = getSettings();
	const minutes = state.startedAt ? Math.round((Date.now() - state.startedAt) / 60_000) : 0;
	const now = shotPath ? "첨부한 지금 화면" : "지금 상황";
	const ask: Record<SpeakKind, string> = {
		encourage: `${now}을 보고, 사용자가 바로 지금 하는 일에 맞춘 짧은 격려나 가벼운 한마디를 해줘. 막연한 칭찬 말고 화면에 보이는 것을 구체적으로 짚어서.`,
		joke: `${now}에 보이는 것과 관련된 짧고 가벼운 농담이나 재밌는 사실 하나를 건네줘. 썰렁해도 괜찮아. 하던 일의 흐름을 끊지 않게 한 문장.`,
		break: `사용자가 ${minutes}분째 집중하고 있어. ${shotPath ? "지금 화면을 살짝 짚으면서 " : ""}잠깐 스트레칭이나 물 마시기를 권하는 한마디를 해줘.`,
		nudge:
			"사용자가 몇 분째 목표와 무관한 화면에 있어. 꾸짖지 말고, 아까 하던 지점을 구체적으로 짚으면서 돌아갈지 부드럽게 물어봐.",
	};
	// 세션 중에도 최근 15분 기록만. 세션 밖이면 기록을 아예 넘기지 않는다 (지금 화면만 보고 말한다)
	const recent = state.running ? recentSummaries(8, RECENT_CONTEXT_MS) : "";
	try {
		ev?.mood("thinking");
		const text = await complete("summary", {
			system: [
				...personaLines(currentCharacter()),
				state.running
					? "지금은 사용자의 공부를 옆에서 응원하는 한마디를 건넨다."
					: "지금은 사용자가 컴퓨터로 하는 일을 옆에서 보다가 가볍게 한마디 건넨다. 공부 중이라고 가정하지 않는다.",
				s.tone === "banmal" ? "반말로 친근하게 말한다." : "존댓말로 다정하게 말한다.",
				"말풍선에 들어갈 한두 문장만 출력한다. 따옴표나 머리말 없이 본문만.",
				"퀴즈를 내거나 학습 내용을 확인하는 질문은 하지 않는다. 죄책감을 주는 표현은 쓰지 않는다.",
				...(shotPath
					? [
							"첨부한 스크린샷은 바로 지금 사용자의 화면이다. 이 화면에 반응한다. 예전에 하던 일이나 몇 시간 전 내용은 꺼내지 않는다.",
							"화면에 비밀번호, 은행·결제 정보, 개인 메시지 같은 민감한 내용이 보이면 그 내용은 전혀 언급하지 말고 일반적인 다정한 한마디만 한다.",
						]
					: ["화면을 볼 수 없으니 화면 내용을 지어내지 말고 일반적인 다정한 한마디를 한다."]),
			].join("\n"),
			history: [],
			images: shotPath ? [shotPath] : [],
			maxTokens: 200,
			userText: [
				state.running ? `세션 목표: ${state.goal || "(정하지 않음)"}` : "",
				state.running ? `세션 진행: ${minutes}분` : "공부 세션은 시작하지 않은 상태",
				recent ? `최근 15분 화면 기록 (참고만):\n${recent}` : "",
				shotPath ? "[지금 화면 스크린샷 1장 첨부]" : "",
				extra,
				"",
				ask[kind],
			]
				.filter(Boolean)
				.join("\n"),
		});
		const line = text.trim().replace(/^["“]|["”]$/g, "");
		if (line) ev?.petSays(line, kind);
		ev?.mood(kind === "nudge" ? "idle" : "happy");
		setTimeout(() => ev?.mood(state.running ? "focus" : "idle"), 2500);
	} catch (err) {
		console.error("[proactive] 말 걸기 실패", err);
		appLog(`proactive speak failed: ${String(err).slice(0, 120)}`);
		ev?.mood(state.running ? "focus" : "idle");
	}
}
