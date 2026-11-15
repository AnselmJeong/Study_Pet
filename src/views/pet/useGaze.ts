import { type RefObject, useEffect, useRef } from "react";
import { on } from "../common/rpc";

/**
 * 커서 쪽을 바라보는 시선. 결과는 리렌더 없이 대상 요소의 CSS 변수
 * `--gx`, `--gy` (-1..1)로 넣는다. 잉키 눈동자와 몸 기울기가 이 값을 쓴다.
 *
 * 곡선은 A8Chann/dsh-pet-live2d(MIT)의 시선 추적을 따랐다.
 *  - 펫 얼굴 중심에서 커서까지의 거리를 반경 RANGE_PX로 나눠 정규화 (원형)
 *  - 가운데 DEADZONE 안은 0 (손떨림에 눈이 흔들리지 않게)
 *  - RANGE_PX에서 최대로 돌아보고, RANGE_PX × WATCH_RATIO까지 서서히 관심을 잃다가 그 밖이면 정면
 *  - 목표값은 지수 보간으로 부드럽게 따라간다
 */
const RANGE_PX = 220;
const WATCH_RATIO = 2.7;
const DEADZONE = 0.12;
const EASE_MS = 140;
/** 얼굴 중심: 캐릭터 상자 위에서부터 이 비율 */
const FACE_Y = 0.4;

export type GazeOptions = {
	/** false면 정면으로 돌아온다 (드래그 중, 조는 중 등) */
	active: boolean;
	/** 0..1 시선 세기 (공부 세션 중엔 은은하게) */
	strength: number;
};

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

		const target = () => {
			const el = ref.current;
			const { active, strength } = optsRef.current;
			if (!el || !pointer || !active || strength <= 0) return { x: 0, y: 0 };
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
			const u = Math.hypot(dx, dy) / RANGE_PX;
			const watch = u <= 1 ? 1 : u >= WATCH_RATIO ? 0 : (WATCH_RATIO - u) / (WATCH_RATIO - 1);
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

		const onPointer = (e: PointerEvent) => {
			pointer = { x: e.clientX, y: e.clientY };
			wake();
		};
		const off = on("cursor", (p) => {
			pointer = p;
			wake();
		});
		window.addEventListener("pointermove", onPointer);
		return () => {
			off();
			window.removeEventListener("pointermove", onPointer);
			if (raf) cancelAnimationFrame(raf);
			kick.current = () => {};
		};
	}, [ref]);
}
