// Entry point. Phase 0 just draws the Buyo sprite; the CSS handles the idle bob.
// Later phases will add the dialogue/choice engine and the x402 + Ledger flow.
import { mountSprites } from "./sprites.js";

function init(): void {
  mountSprites();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
