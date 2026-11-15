import { type RefObject, useEffect, useRef } from "react";
import { on } from "../common/rpc";

/**
 * 커서 쪽을 바라보는 시선. 결과는 리렌더 없이 대상 요소의 CSS 변수
 * `--gx`, `--gy` (-1..1)로 넣는다. 잉키 눈동자와 몸 기울기가 이 값을 쓴다.
 *
 * 곡선은 A8Chann/dsh-pet-live2d(MIT)의 시선 추적에서 시작했지만 데스크톱 펫에 맞게 넓혔다.
 * 펫은 화면 구석에 있어서 커서가 대부분 수백~천 px 떨어져 있다. 반경 220px짜리 원래 곡선으로는
 * 거의 늘 "관심 없음"이라 움직임이 보이지 않았다.
 *  - 얼굴 중심에서 커서까지 RANGE_PX 정도면 최대로 돌아본다. 가운데 DEADZONE 안은 0
 *  - 화면 어디에 있든 바라보고, FAR_PX보다 멀면 조금 덜 돌아본다
 *  - 커서가 BORED_MS 동안 안 움직이면 흥미를 잃고 정면으로 돌아온다
 *  - 목표값은 지수 보간으로 부드럽게 따라간다
 */
const RANGE_PX = 260;
const DEADZONE = 0.06;
const FAR_PX = 1400;
const FAR_STRENGTH = 0.7;
const BORED_MS = 7000;
const EASE_MS = 160;
/** 얼굴 중심: 캐릭터 상자 위에서부터 이 비율 */
const FACE_Y = 0.4;

export type GazeOptions = {
	/** false면 정면으로 돌아온다 (드래그 중, 조는 중 등) */
	active: boolean;
	/** 0..1 시선 세기 (공부 세션 중엔 은은하게) */
	strength: number;
	/** 커서가 확실히 왼쪽(-1)이나 오른쪽(1)에 있을 때 알려 준다. 바뀔 때만 부른다 */
	onSide?: (side: -1 | 0 | 1) => void;
};
/** 옆을 보기 시작하는 값과 정면으로 돌아오는 값 (깜빡거림 방지) */
const SIDE_ON = 0.35;
const SIDE_OFF = 0.18;

export function useGaze(ref: RefObject<HTMLElement | null>, opts: GazeOptions) {
	const optsRef = useRef(opts);
	optsRef.current = opts;
	const kick = useRef<() => void>(() => {});

	useEffect(() => kick.current(), [opts.active, opts.strength]);

	useEffect(() => {
		let pointer: { x: number; y: number } | null = null;
		const g = { x: 0, y: 0 };
		let raf = 0;
		let last = 0;
		let side: -1 | 0 | 1 = 0;
		let movedAt = 0;
		let boredTimer: ReturnType<typeof setTimeout> | null = null;

		const target = () => {
			const el = ref.current;
			const { active, strength } = optsRef.current;
			if (!el || !pointer || !active || strength <= 0) return { x: 0, y: 0 };
			if (Date.now() - movedAt > BORED_MS) return { x: 0, y: 0 };
			const r = el.getBoundingClientRect();
			if (r.width === 0) return { x: 0, y: 0 };
			const dx = pointer.x - (r.left + r.width / 2);
			const dy = pointer.y - (r.top + r.height * FACE_Y);
			const shape = (v: number) => {
				const a = Math.abs(v);
				if (a <= DEADZONE) return 0;
				const t = Math.min(1, (a - DEADZONE) / (1 - DEADZONE));
				return v < 0 ? -t : t;
			};
			let x = shape(dx / RANGE_PX);
			let y = shape(dy / RANGE_PX);
			const n = Math.hypot(x, y);
			if (n > 1) {
				x /= n;
				y /= n;
			}
			const d = Math.hypot(dx, dy);
			const watch = d <= FAR_PX ? 1 : Math.max(FAR_STRENGTH, 1 - ((d - FAR_PX) / FAR_PX) * (1 - FAR_STRENGTH));
			const k = watch * strength;
			return { x: x * k, y: y * k };
		};

		const frame = (now: number) => {
			raf = 0;
			const dt = last ? Math.min(100, now - last) : 16;
			last = now;
			const t = target();
			const a = 1 - Math.exp(-dt / EASE_MS);
			g.x += (t.x - g.x) * a;
			g.y += (t.y - g.y) * a;
			const settled = Math.abs(t.x - g.x) < 0.002 && Math.abs(t.y - g.y) < 0.002;
			if (settled) {
				g.x = t.x;
				g.y = t.y;
			}
			const next: -1 | 0 | 1 = Math.abs(g.x) >= SIDE_ON ? (g.x < 0 ? -1 : 1) : Math.abs(g.x) <= SIDE_OFF ? 0 : side;
			if (next !== side) {
				side = next;
				optsRef.current.onSide?.(side);
			}
			const el = ref.current;
			if (el) {
				el.style.setProperty("--gx", g.x.toFixed(3));
				el.style.setProperty("--gy", g.y.toFixed(3));
			}
			// 다 따라갔으면 쉰다. 새 커서 위치가 오면 다시 돈다
			if (settled) last = 0;
			else raf = requestAnimationFrame(frame);
		};
		const wake = () => {
			if (!raf) raf = requestAnimationFrame(frame);
		};
		kick.current = wake;

		const moved = (p: { x: number; y: number }) => {
			pointer = p;
			movedAt = Date.now();
			// 한동안 안 움직이면 정면으로 돌아오게 한 번 더 깨운다
			if (boredTimer) clearTimeout(boredTimer);
			boredTimer = setTimeout(wake, BORED_MS + 50);
			wake();
		};
		const onPointer = (e: PointerEvent) => moved({ x: e.clientX, y: e.clientY });
		const off = on("cursor", moved);
		window.addEventListener("pointermove", onPointer);
		return () => {
			off();
			window.removeEventListener("pointermove", onPointer);
			if (raf) cancelAnimationFrame(raf);
			if (boredTimer) clearTimeout(boredTimer);
			kick.current = () => {};
		};
	}, [ref]);
}
