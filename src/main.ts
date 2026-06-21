// Entry point: play the intro loader, then start the cartoon engine.
import { runLoader } from "./loader.js";
import { startEngine } from "./engine.js";

async function init(): Promise<void> {
  await runLoader();
  void startEngine();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
