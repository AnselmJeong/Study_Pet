import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "../common/base.css";
import "./pet.css";
import { PetApp } from "./PetApp";

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<PetApp />
	</StrictMode>,
);
