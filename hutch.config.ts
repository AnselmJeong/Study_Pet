export default {
	electrobun: {
		version: "2.0.6",
	},
	scripts: {
		install: ["hutch", "install"],
		start: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev",
		dev: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun dev --watch",
		build: "hutch electrobun prepare && hutch pm exec -- vite build && hutch electrobun build --env=stable",
		typecheck: "hutch electrobun prepare && hutch pm exec -- tsc --noEmit",
	},
};
