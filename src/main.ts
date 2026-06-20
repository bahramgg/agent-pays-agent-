// Phase 0: render one static pixel-art agent to a tiny canvas.
// The canvas is 16x16 native pixels; CSS scales it up with image-rendering:
// pixelated, so every "pixel" stays a hard-edged square. No gradients, no blur.

/** Flat color legend for the sprite map. Stays inside the Base palette. */
const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue for depth
  W: "#ffffff", // white (eyes / screen)
};

/**
 * 16x16 pixel-art agent robot. Each char maps to a PALETTE color.
 * Read it like a grid — what you see is what renders.
 */
const SPRITE: string[] = [
  "................",
  ".......KK.......",
  ".......WW.......",
  ".......KK.......",
  "....KKKKKKKK....",
  "...KBBBBBBBBK...",
  "..KBBBBBBBBBBK..",
  "..KBWWKBBKWWBK..",
  "..KBWWKBBKWWBK..",
  "..KBBBBBBBBBBK..",
  "..KBKKKKKKKKBK..",
  "..KBBBBBBBBBBK..",
  "...KDBBBBBBDK...",
  "....KKKKKKKK....",
  "....K..KK..K....",
  "....KK.KK.KK....",
];

function drawSprite(canvas: HTMLCanvasElement): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // Keep upscaling crisp on the 2D context too (belt and suspenders with CSS).
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let y = 0; y < SPRITE.length; y++) {
    const row = SPRITE[y];
    for (let x = 0; x < row.length; x++) {
      const color = PALETTE[row[x]] ?? "transparent";
      if (color === "transparent") continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

const canvas = document.getElementById("sprite");
if (canvas instanceof HTMLCanvasElement) {
  drawSprite(canvas);
}
