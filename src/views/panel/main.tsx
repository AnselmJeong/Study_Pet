import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../common/base.css";
import { installContextMenu } from "../common/rpc";
import { PanelApp } from "./PanelApp";

installContextMenu("panel");

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PanelApp />
	</StrictMode>,
);
