// 공부 세션 동안 주기적으로 화면을 캡처하고, 요약 모델(기본: Claude Sonnet)로 한 줄 요약을 만들어
// 타임라인에 쌓는다. 스크린샷은 링버퍼(개수 + 보관 시간)로 지우고, 텍스트 요약은 남긴다.
// 같은 루프에서 펫이 먼저 말을 거는 일(격려, 농담, 휴식 권유, 부드러운 복귀 제안)도 맡는다.

import { appendFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Activity, CaptureState, PetMood, Relevance, TimelineEntry } from "../shared/types";
import { captureScreen, deleteShot, fingerprint, fingerprintDiff, frontmostApp, idleSeconds } from "./capture";
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
};

let ev: ContextEvents | null = null;
const state: CaptureState = { running: false, paused: false, goal: "", startedAt: null, lastCaptureAt: null };

/** 화면이 "같다"고 보는 지문 차이 기준 (0~255) */
const SAME_SCREEN_DIFF = 2.5;
/** 입력도 화면 변화도 없는 상태가 이만큼 이어지면 자동 일시정지 */
const AUTO_PAUSE_MS = 15 * 60_000;
let lastFp: Uint8Array | null = null;
let stillSince: number | null = null;
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

/** 질문 답변용: 최근 n개의 요약 텍스트 */
export function recentSummaries(n = 20): string {
	const recent = timeline.filter((e) => !e.skipped && !e.error).slice(-n);
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
	stillSince = null;
	state.goal = goal.trim();
	state.startedAt = Date.now();
	ev?.captureState(getState());
	ev?.mood("focus");
	void tick(); // 바로 첫 캡처
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
}

function scheduleNext() {
	if (!state.running) return;
	if (captureTimer) clearTimeout(captureTimer);
	captureTimer = setTimeout(() => void tick(), getSettings().capture.intervalSec * 1000);
}

function pauseUntilActive() {
	state.paused = true;
	ev?.captureState(getState());
	ev?.mood("idle");
	addEntry({
		id: newId(),
		ts: Date.now(),
		app: "",
		summary: "입력과 화면 변화가 15분 넘게 없어 기록을 잠시 멈춤",
		activity: "other",
		relevance: "break",
		keyTerms: [],
		skipped: "auto-pause",
	});
	if (pausePoll) clearInterval(pausePoll);
	pausePoll = setInterval(() => {
		if (!state.running) return;
		if (idleSeconds() < 10) {
			if (pausePoll) clearInterval(pausePoll);
			pausePoll = null;
			state.paused = false;
			stillSince = null;
			lastFp = null;
			ev?.captureState(getState());
			ev?.mood("focus");
			void tick();
		}
	}, 15_000);
}

async function tick() {
	if (!state.running || state.paused) return;
	if (capturing) return scheduleNext();
	capturing = true;
	let paused = false;
	try {
		const s = getSettings();
		const app = frontmostApp();
		const base = { id: newId(), ts: Date.now(), app, summary: "", activity: "other" as Activity, keyTerms: [] };
		const idle = idleSeconds() > s.capture.idleSkipSec;

		const excluded = s.capture.excludedApps.find((x) => x && app.toLowerCase().includes(x.toLowerCase()));
		if (excluded) {
			addEntry({ ...base, relevance: "unknown", summary: `제외 앱 사용 중 (${app})`, skipped: "excluded" });
			return;
		}
		const shot = await captureScreen();
		if (!shot) {
			addEntry({ ...base, relevance: "unknown", summary: "캡처 실패 (화면 기록 권한 확인)", skipped: "no-permission" });
			return;
		}

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
			if (idle) {
				stillSince ??= Date.now();
				if (Date.now() - stillSince >= AUTO_PAUSE_MS) {
					paused = true;
					pauseUntilActive();
				}
			}
			return;
		}
		stillSince = null;

		// 입력은 없지만 화면이 바뀌는 경우(강의 영상 등)는 계속 기록한다
		state.lastCaptureAt = shot.ts;
		ev?.captureState(getState());

		if (!supportsVision("summary", s)) {
			addEntry({ ...base, ts: shot.ts, shotPath: shot.path, relevance: "unknown", summary: "(요약 모델이 이미지를 못 봄)" });
			return;
		}
		try {
			const parsed = await summarize(shot.path, app, idle);
			addEntry({ ...base, ts: shot.ts, shotPath: shot.path, ...parsed });
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
		if (!paused) scheduleNext();
	}
}

const ACTIVITIES: Activity[] = ["reading", "writing", "coding", "searching", "video", "chat", "other"];
const RELEVANCES: Relevance[] = ["on_task", "related", "off_task", "break"];

async function summarize(
	shotPath: string,
	app: string,
	idle: boolean,
): Promise<Pick<TimelineEntry, "summary" | "activity" | "relevance" | "keyTerms">> {
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
			`  "keyTerms": ["화면에 보이는 핵심 용어 최대 5개"]}`,
			"비밀번호, 금융 정보, 개인 메시지가 보이면 내용을 적지 말고 summary를 '민감한 화면'으로 써.",
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
	const min = Math.max(3, p.minIntervalMin);
	const max = Math.max(min, p.maxIntervalMin);
	const delay = (min + Math.random() * (max - min)) * 60_000;
	proactiveTimer = setTimeout(() => {
		void proactiveTick().finally(scheduleProactive);
	}, delay);
}

/** 설정이 바뀌면 다음 말 걸기 시점을 다시 잡는다 */
export function rescheduleProactive() {
	scheduleProactive();
}

async function proactiveTick() {
	const p = getSettings().proactive;
	if (!p.enabled || ev?.isChatBusy()) return;
	if (idleSeconds() > 5 * 60) return; // 자리에 없으면 말 걸지 않음
	const minutes = state.startedAt ? (Date.now() - state.startedAt) / 60_000 : 0;
	let kind: "encourage" | "joke" | "break";
	if (state.running && minutes > 50 && Math.random() < 0.6) kind = "break";
	else if (p.jokes && Math.random() < 0.35) kind = "joke";
	else kind = "encourage";
	await speak(kind, "");
}

async function speak(kind: "encourage" | "joke" | "break" | "nudge", extra: string) {
	const s = getSettings();
	const minutes = state.startedAt ? Math.round((Date.now() - state.startedAt) / 60_000) : 0;
	const ask: Record<typeof kind, string> = {
		encourage:
			"지금 사용자가 하는 일을 보고, 구체적이고 짧은 격려 한마디를 해줘. 막연한 칭찬 말고 화면에서 본 내용이나 진행 상황을 짚어서.",
		joke: "지금 사용자가 공부하는 주제와 관련된 짧고 가벼운 농담이나 재밌는 사실 하나를 건네줘. 썰렁해도 괜찮아. 공부 흐름을 끊지 않게 한 문장.",
		break: `사용자가 ${minutes}분째 집중하고 있어. 잠깐 스트레칭이나 물 마시기를 권하는 한마디를 해줘.`,
		nudge:
			"사용자가 몇 분째 목표와 무관한 화면에 있어. 꾸짖지 말고, 아까 하던 지점을 구체적으로 짚으면서 돌아갈지 부드럽게 물어봐.",
	};
	try {
		ev?.mood("thinking");
		const text = await complete("summary", {
			system: [
				"너는 사용자의 화면 구석에 사는 잉크 방울 요정 '잉키'다. 사용자의 공부를 옆에서 응원한다.",
				s.tone === "banmal" ? "반말로 친근하게 말한다." : "존댓말로 다정하게 말한다.",
				"말풍선에 들어갈 한두 문장만 출력한다. 따옴표나 머리말 없이 본문만.",
				"퀴즈를 내거나 학습 내용을 확인하는 질문은 하지 않는다. 죄책감을 주는 표현은 쓰지 않는다.",
			].join("\n"),
			history: [],
			images: [],
			maxTokens: 200,
			userText: [
				`세션 목표: ${state.goal || "(정하지 않음)"}`,
				state.running ? `세션 진행: ${minutes}분` : "공부 세션은 시작하지 않은 상태",
				`최근 화면 기록:\n${recentSummaries(8) || "(기록 없음)"}`,
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
		ev?.mood(state.running ? "focus" : "idle");
	}
}
