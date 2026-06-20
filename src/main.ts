// Entry point: draw every sprite, then wire up the animated exchange flow.
import { mountSprites } from "./sprites.js";
import { setupFlow } from "./flow.js";

function init(): void {
  mountSprites();
  setupFlow();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
