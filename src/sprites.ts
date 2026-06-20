// Pixel-art sprite system.
// A sprite is a grid of characters; each char maps to one flat color in
// PALETTE. Sprites render at native resolution onto a <canvas>, then CSS scales
// them up with image-rendering: pixelated so every pixel stays a hard square.
// No gradients, no blur, no soft shadows -- strictly flat color cells.
//
// The Ledger Nano device is built in CSS (hard-edged blocks) rather than here,
// because it needs a readable multi-line screen and two interactive buttons.

/** Flat color legend. Base palette dominates; gold is a small accent. */
const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue (shade)
  L: "#3d7bff", // flat lighter blue (highlight)
  W: "#ffffff", // white (face / eyes)
  Y: "#f5b301", // gold accent (coin / sun)
};

export type SpriteMap = string[];

/**
 * Buyo, the buyer agent. 24x24: antenna, white face with two eyes and a smile,
 * and a gold coin emblem on the chest (he is the buyer).
 */
const buyo: SpriteMap = [
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
  "......KDDDDDDDDDDK......",
  "........KKK..KKK........",
];

/**
 * Sella, the seller agent. 24x24: two small antennae (distinct from Buyo's
 * single one), wide-set happy eyes, and a gold sun emblem (the Weather Oracle
 * service she sells).
 */
const sella: SpriteMap = [
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
  "......KDDDDDDDDDDK......",
  "........KKK..KKK........",
];

/** Weather Oracle service icon: a gold sun, shown on delivery. */
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

export const SPRITES = {
  buyo,
  sella,
  weather,
} as const;

export type SpriteName = keyof typeof SPRITES;

/** Draw a sprite map onto a freshly sized canvas (1 cell = 1 native pixel). */
export function createSpriteCanvas(name: SpriteName): HTMLCanvasElement {
  const map = SPRITES[name];
  const height = map.length;
  const width = map.reduce((max, row) => Math.max(max, row.length), 0);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.className = "pixel-canvas";

  const ctx = canvas.getContext("2d");
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
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
  return canvas;
}

/** Mount every [data-sprite="name"] container with its drawn canvas. */
export function mountSprites(): void {
  const boxes = document.querySelectorAll<HTMLElement>("[data-sprite]");
  boxes.forEach((box) => {
    const name = box.dataset.sprite as SpriteName | undefined;
    if (name && name in SPRITES) {
      box.appendChild(createSpriteCanvas(name));
    }
  });
}
