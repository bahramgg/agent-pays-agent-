// Entry point: start the cartoon engine (it creates the actors and the device).
import { startEngine } from "./engine.js";

function init(): void {
  void startEngine();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
