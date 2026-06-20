// Entry point: draw the sprites, then start the cartoon engine.
import { mountSprites } from "./sprites.js";
import { startEngine } from "./engine.js";

function init(): void {
  mountSprites();
  void startEngine();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
