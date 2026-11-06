import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../common/base.css";
import { installContextMenu } from "../common/rpc";
import "./pet.css";
import { PetApp } from "./PetApp";

installContextMenu("pet");

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PetApp />
	</StrictMode>,
);
