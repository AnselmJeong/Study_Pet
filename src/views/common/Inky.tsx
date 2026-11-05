import type { PetMood } from "../../shared/types";

/**
 * 잉키(Inky): 잉크 한 방울에서 태어난 책갈피 요정. 오리지널 캐릭터.
 * 남색 물방울 몸통, 흰 점 눈, 꼬리 대신 빨간 책갈피 리본.
 */
export function Inky({ mood, size = 120 }: { mood: PetMood; size?: number }) {
	const eyes = (() => {
		switch (mood) {
			case "happy":
				// 웃는 눈 (^ ^)
				return (
					<g stroke="#fff" strokeWidth="4" strokeLinecap="round" fill="none">
						<path d="M40 70 q6 -8 12 0" />
						<path d="M68 70 q6 -8 12 0" />
					</g>
				);
			case "error":
				return (
					<g fill="#fff">
						<ellipse cx="46" cy="70" rx="5" ry="6" />
						<ellipse cx="74" cy="70" rx="5" ry="6" />
						<path d="M38 62 l12 -4 M82 62 l-12 -4" stroke="#fff" strokeWidth="3" strokeLinecap="round" />
					</g>
				);
			case "thinking":
				return (
					<g fill="#fff">
						<circle cx="50" cy="66" r="6" />
						<circle cx="78" cy="66" r="6" />
					</g>
				);
			default:
				return (
					<g fill="#fff" className="inky-blink">
						<ellipse cx="46" cy="70" rx="6.5" ry="8" />
						<ellipse cx="74" cy="70" rx="6.5" ry="8" />
						<circle cx="48" cy="67" r="2" fill="#1b2350" />
						<circle cx="76" cy="67" r="2" fill="#1b2350" />
					</g>
				);
		}
	})();

	return (
		<svg
			width={size}
			height={size * 1.15}
			viewBox="0 0 120 138"
			className={`inky inky-${mood}`}
			aria-label="잉키"
		>
			<defs>
				<radialGradient id="inkBody" cx="38%" cy="35%" r="75%">
					<stop offset="0%" stopColor="#4b5fb8" />
					<stop offset="55%" stopColor="#26326f" />
					<stop offset="100%" stopColor="#141a40" />
				</radialGradient>
				<clipPath id="bodyClip">
					<path d="M60 8 C 72 30, 104 52, 104 84 C 104 110, 84 126, 60 126 C 36 126, 16 110, 16 84 C 16 52, 48 30, 60 8 Z" />
				</clipPath>
			</defs>

			{/* 그림자 */}
			<ellipse cx="60" cy="132" rx="30" ry="4" fill="rgba(0,0,0,0.25)" className="inky-shadow" />

			<g className="inky-body">
				{/* 책갈피 리본 꼬리 */}
				<path d="M88 112 l14 22 l-8 -3 l-3 8 l-10 -22 z" fill="#d8342f" className="inky-ribbon" />

				{/* 몸통 */}
				<path
					d="M60 8 C 72 30, 104 52, 104 84 C 104 110, 84 126, 60 126 C 36 126, 16 110, 16 84 C 16 52, 48 30, 60 8 Z"
					fill="url(#inkBody)"
				/>
				{/* 몸 안의 잉크 수위 (M1에서 집중도와 연결) */}
				<g clipPath="url(#bodyClip)">
					<rect x="10" y="104" width="100" height="30" fill="rgba(120,150,255,0.18)" className="inky-level" />
				</g>
				{/* 하이라이트 */}
				<ellipse cx="42" cy="46" rx="7" ry="11" fill="rgba(255,255,255,0.28)" transform="rotate(25 42 46)" />

				{eyes}

				{/* 입 */}
				{mood === "talking" && <ellipse cx="60" cy="88" rx="6" ry="4" fill="#0d1230" className="inky-mouth" />}
				{mood === "happy" && <path d="M52 86 q8 8 16 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />}
				{mood === "error" && <path d="M52 90 q8 -6 16 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />}

				{/* 손 (작은 잉크 방울) */}
				<circle cx="18" cy="98" r="7" fill="#26326f" className="inky-hand-l" />
				<circle cx="102" cy="98" r="7" fill="#26326f" className="inky-hand-r" />
			</g>

			{/* 생각 중: 머리 위 잉크 방울 3개 */}
			{mood === "thinking" && (
				<g fill="#4b5fb8">
					<circle cx="44" cy="10" r="4" className="inky-dot inky-dot-1" />
					<circle cx="60" cy="4" r="4" className="inky-dot inky-dot-2" />
					<circle cx="76" cy="10" r="4" className="inky-dot inky-dot-3" />
				</g>
			)}
		</svg>
	);
}
