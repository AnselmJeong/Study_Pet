import type { PetAction, PetMood } from "../../shared/types";

/**
 * 잉키(Inky): 잉크 한 방울에서 태어난 책갈피 요정. 오리지널 캐릭터.
 * 남색 물방울 몸통, 흰 점 눈, 꼬리 대신 빨간 책갈피 리본.
 * mood = 감정 상태, action = 가만히 있을 때 가끔 하는 행동.
 */
export function Inky({ mood, action = "none", size = 120 }: { mood: PetMood; action?: PetAction; size?: number }) {
	const sleeping = action === "doze";
	const eyes = (() => {
		if (sleeping) {
			return (
				<g stroke="#fff" strokeWidth="3.5" strokeLinecap="round" fill="none">
					<path d="M40 72 q6 4 12 0" />
					<path d="M68 72 q6 4 12 0" />
				</g>
			);
		}
		switch (mood) {
			case "happy":
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
					<g className="inky-eyes">
						<g fill="#fff" className="inky-blink">
							<ellipse cx="46" cy="70" rx="6.5" ry="8" />
							<ellipse cx="74" cy="70" rx="6.5" ry="8" />
							<circle cx={action === "read" ? 46 : 48} cy={action === "read" ? 74 : 67} r="2" fill="#1b2350" />
							<circle cx={action === "read" ? 74 : 76} cy={action === "read" ? 74 : 67} r="2" fill="#1b2350" />
						</g>
					</g>
				);
		}
	})();

	return (
		<svg
			width={size}
			height={size * 1.15}
			viewBox="0 0 120 138"
			className={`inky inky-${mood} inky-act-${action}`}
			aria-label="잉키"
			overflow="visible"
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

			<ellipse cx="60" cy="132" rx="30" ry="4" fill="rgba(0,0,0,0.25)" className="inky-shadow" />

			<g className="inky-body">
				<path d="M88 112 l14 22 l-8 -3 l-3 8 l-10 -22 z" fill="#d8342f" className="inky-ribbon" />
				<path
					d="M60 8 C 72 30, 104 52, 104 84 C 104 110, 84 126, 60 126 C 36 126, 16 110, 16 84 C 16 52, 48 30, 60 8 Z"
					fill="url(#inkBody)"
				/>
				<g clipPath="url(#bodyClip)">
					<rect
						x="10"
						y={mood === "focus" ? 92 : 104}
						width="100"
						height="40"
						fill="rgba(120,150,255,0.2)"
						className="inky-level"
					/>
				</g>
				<ellipse cx="42" cy="46" rx="7" ry="11" fill="rgba(255,255,255,0.28)" transform="rotate(25 42 46)" />

				{eyes}

				{mood === "talking" && <ellipse cx="60" cy="88" rx="6" ry="4" fill="#0d1230" className="inky-mouth" />}
				{mood === "happy" && <path d="M52 86 q8 8 16 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />}
				{mood === "error" && <path d="M52 90 q8 -6 16 0" stroke="#fff" strokeWidth="3" fill="none" strokeLinecap="round" />}
				{action === "stretch" && <ellipse cx="60" cy="88" rx="5" ry="6" fill="#0d1230" />}

				{/* 손 */}
				<circle cx="18" cy="98" r="7" fill="#26326f" className="inky-hand-l" />
				<circle cx="102" cy="98" r="7" fill="#26326f" className="inky-hand-r" />

				{/* 책 읽기: 작은 펼친 책 */}
				{action === "read" && (
					<g className="inky-book">
						<path d="M34 96 L60 102 L60 120 L34 114 Z" fill="#f4ead2" stroke="#8a6d3b" strokeWidth="1.2" />
						<path d="M86 96 L60 102 L60 120 L86 114 Z" fill="#fbf3df" stroke="#8a6d3b" strokeWidth="1.2" />
						<path d="M40 103 l14 3 M40 108 l14 3 M66 106 l14 -3 M66 111 l14 -3" stroke="#b9a37a" strokeWidth="1" />
					</g>
				)}
			</g>

			{mood === "thinking" && (
				<g fill="#4b5fb8">
					<circle cx="44" cy="10" r="4" className="inky-dot inky-dot-1" />
					<circle cx="60" cy="4" r="4" className="inky-dot inky-dot-2" />
					<circle cx="76" cy="10" r="4" className="inky-dot inky-dot-3" />
				</g>
			)}

			{sleeping && (
				<g fill="#c9d3ff" fontFamily="sans-serif" fontWeight="700">
					<text x="88" y="30" fontSize="12" className="inky-z inky-z-1">z</text>
					<text x="96" y="18" fontSize="15" className="inky-z inky-z-2">Z</text>
				</g>
			)}
		</svg>
	);
}
