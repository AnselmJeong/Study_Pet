import type { ElectrobunConfig } from "electrobun";

export default {
	app: {
		name: "Inky",
		identifier: "dev.anselm.studypet",
		version: "0.0.1",
	},
	build: {
		mainProcess: "bun",
		bun: {
			entrypoint: "src/bun/index.ts",
		},
		// Vite가 dist/에 두 개의 뷰(pet, panel)를 빌드하고, 여기서 앱 번들로 복사한다.
		copy: {
			"dist/pet": "views/app/pet",
			"dist/panel": "views/app/panel",
			"dist/assets": "views/app/assets",
		},
		watchIgnore: ["dist/**"],
		mac: {
			bundleCEF: false,
			// 잉키 SVG(assets/icon.svg)에서 렌더한 아이콘. scripts/make-icon.sh로 다시 만들 수 있다.
			icons: "assets/icon.iconset",
		},
		linux: {
			bundleCEF: false,
		},
		win: {
			bundleCEF: false,
		},
	},
} satisfies ElectrobunConfig;
