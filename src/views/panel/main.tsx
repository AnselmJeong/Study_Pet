import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../common/base.css";
import { PanelApp } from "./PanelApp";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PanelApp />
	</StrictMode>,
);
