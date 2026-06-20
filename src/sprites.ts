// Pixel-art sprite system.
// A sprite is a grid of characters; each char maps to one flat color in
// PALETTE. Sprites render at native resolution onto a <canvas>, then CSS scales
// them up with image-rendering: pixelated so every pixel stays a hard square.
// No gradients, no blur, no soft shadows -- strictly flat color cells.
//
// Buyo and Sella are little robots with legs, so they can WALK: each has a
// standing pose plus a 2-frame walk cycle (legs spread / legs together). They
// share an upper body and only swap the leg rows, which keeps the grids honest.
//
// The Ledger Stax device is built in CSS (hard-edged blocks) for its readable
// touchscreen, paged review, and hold-to-sign control.

const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline / legs
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue (shade)
  L: "#3d7bff", // flat lighter blue (highlight)
  W: "#ffffff", // white (face / eyes)
  Y: "#f5b301", // gold accent (coin / sun)
};

export type SpriteMap = string[];

// --- shared upper bodies (rows 0-21) --------------------------------------
const buyoUpper: SpriteMap = [
  "........................",
  "...........LL...........",
  "...........LL...........",
  "...........KK...........",
  ".......KKKKKKKKKK.......",
  "......KLLLLLLLLLLK......",
  ".....KBBBBBBBBBBBBK.....",
  ".....KBBBBBBBBBBBBK.....",
  ".....KBBWWWWWWWWBBK.....",
  ".....KBBWKKWWKKWBBK.....",
  ".....KBBWKKWWKKWBBK.....",
  ".....KBBWWWWWWWWBBK.....",
  ".....KBBWKWWWWKWBBK.....",
  ".....KBBWWKKKKWWBBK.....",
  ".....KBBBBBBBBBBBBK.....",
  ".....KDDDDDDDDDDDDK.....",
  ".......KKKKKKKKKK.......",
  "......KKKKKKKKKKKK......",
  "......KBBBYYYYBBBK......",
  ".....KKBBBYKKYBBBKK.....",
  "......KBBBYKKYBBBK......",
  "......KBBBYYYYBBBK......",
];

const sellaUpper: SpriteMap = [
  "........................",
  ".......L......L.........",
  ".......K......K.........",
  ".......KK....KK.........",
  ".......KKKKKKKKKK.......",
  "......KLLLLLLLLLLK......",
  ".....KBBBBBBBBBBBBK.....",
  ".....KBBBBBBBBBBBBK.....",
  ".....KBBWWWWWWWWBBK.....",
  ".....KBBWKWWWWKWBBK.....",
  ".....KBBWKWWWWKWBBK.....",
  ".....KBBWWWWWWWWBBK.....",
  ".....KBBWWKKKKWWBBK.....",
  ".....KBBWKWWWWKWBBK.....",
  ".....KBBBBBBBBBBBBK.....",
  ".....KDDDDDDDDDDDDK.....",
  ".......KKKKKKKKKK.......",
  "......KKKKKKKKKKKK......",
  "......KBBBYYYYBBBK......",
  ".....KKBBYYYYYYBBKK.....",
  "......KBBYYYYYYBBK......",
  "......KBBBYYYYBBBK......",
];

// --- swappable leg rows (rows 22-25) --------------------------------------
const legsStand: SpriteMap = [
  "......KDDDDDDDDDDK......",
  "........KK....KK........",
  "........KK....KK........",
  ".......KKK...KKK........",
];
const legsWalkA: SpriteMap = [
  "......KDDDDDDDDDDK......",
  "........KK....KK........",
  ".......KK......KK.......",
  "......KKK....KKK........",
];
const legsWalkB: SpriteMap = [
  "......KDDDDDDDDDDK......",
  "........KK....KK........",
  "........KK....KK........",
  "........KKKKKK..........",
];

const compose = (upper: SpriteMap, legs: SpriteMap): SpriteMap => [...upper, ...legs];

// --- Weather Oracle service icon (gold sun) -------------------------------
const weather: SpriteMap = [
  "................",
  ".......YY.......",
  "...Y...YY...Y...",
  "....Y.YYYY.Y....",
  ".....YYYYYY.....",
  "...YYYYYYYYYY...",
  "..YYYYYYYYYYYY..",
  "YY.YYYYYYYYYY.YY",
  "YY.YYYYYYYYYY.YY",
  "..YYYYYYYYYYYY..",
  "...YYYYYYYYYY...",
  ".....YYYYYY.....",
  "....Y.YYYY.Y....",
  "...Y...YY...Y...",
  ".......YY.......",
  "................",
];

// --- Ledger corner-bracket mark (for the Stax bottom bar) -----------------
const ledgerMark: SpriteMap = [
  "KKK...KKK",
  "K.......K",
  "K.......K",
  ".........",
  ".........",
  ".........",
  "K.......K",
  "K.......K",
  "KKK...KKK",
];

export const ACTORS = {
  buyo: { stand: compose(buyoUpper, legsStand), walk: [compose(buyoUpper, legsWalkA), compose(buyoUpper, legsWalkB)] },
  sella: { stand: compose(sellaUpper, legsStand), walk: [compose(sellaUpper, legsWalkA), compose(sellaUpper, legsWalkB)] },
} as const;

export const SPRITES = { weather, ledgerMark } as const;

/** Resize `canvas` to fit `map` and draw it (1 cell = 1 native pixel). */
export function drawSprite(canvas: HTMLCanvasElement, map: SpriteMap): void {
  const height = map.length;
  const width = map.reduce((max, row) => Math.max(max, row.length), 0);
  if (canvas.width !== width) canvas.width = width;
  if (canvas.height !== height) canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  ctx.clearRect(0, 0, width, height);
  for (let y = 0; y < map.length; y++) {
    const row = map[y];
    for (let x = 0; x < row.length; x++) {
      const color = PALETTE[row[x]] ?? "transparent";
      if (color === "transparent") continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Create a canvas already drawn with `map`. */
export function createSpriteCanvas(map: SpriteMap): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "pixel-canvas";
  drawSprite(canvas, map);
  return canvas;
}
