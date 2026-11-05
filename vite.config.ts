import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { resolve } from "node:path";
import { electrobunViteAliases } from "./.hutch/devkit/api/config/electrobun-vite";

export default defineConfig({
	plugins: [react(), tailwindcss()],
	resolve: {
		alias: electrobunViteAliases(resolve(__dirname, ".hutch/devkit")),
	},
	root: "src/views",
	// views:// 스킴에서 자산을 상대 경로로 찾도록
	base: "./",
	build: {
		outDir: "../../dist",
		emptyOutDir: true,
		rollupOptions: {
			input: {
				pet: resolve(__dirname, "src/views/pet/index.html"),
				panel: resolve(__dirname, "src/views/panel/index.html"),
			},
		},
	},
});
