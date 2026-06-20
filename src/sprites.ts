// Pixel-art sprite system.
// A sprite is a grid of characters; each char maps to one flat color in
// PALETTE. Sprites render at native resolution onto a <canvas>, then CSS scales
// them up with image-rendering: pixelated so every pixel stays a hard square.
// No gradients, no blur, no soft shadows -- strictly flat color cells.

/** Flat color legend. Base palette dominates; gold is a small coin accent. */
const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue (shade)
  L: "#3d7bff", // flat lighter blue (highlight)
  W: "#ffffff", // white (face / eyes)
  Y: "#f5b301", // coin gold (accent only)
};

export type SpriteMap = string[];

/**
 * Buyo, the buyer agent. A friendly 24x24 pixel robot: antenna, white face with
 * two eyes and a smile, and a gold coin emblem on the chest (he is the buyer).
 * Read it like a grid -- what you see is what renders.
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

export const SPRITES = {
  buyo,
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
