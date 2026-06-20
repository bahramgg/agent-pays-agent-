// Pixel-art sprite system.
// A sprite is a grid of characters; each char maps to one flat color. Sprites
// render at native resolution onto a <canvas>, then CSS scales them up with
// image-rendering: pixelated so every pixel stays a hard square. No gradients,
// no blur, no soft shadows -- strictly flat color cells.
//
// Buyo and Sella are charming little robots: antenna, head with a face, a neck,
// a torso with ARMS, and two LEGS with feet. They are NOT boxed in a frame.
// Each robot uses generic body chars (C body, E shade, H highlight, A antenna)
// recolored per-robot via a palette, so they are easy to tell apart.

export type SpriteMap = string[];
export type Palette = Record<string, string>;

/** Shared colors used by every sprite. */
const BASE: Palette = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline / limbs
  W: "#ffffff", // white (face / eyes)
};

/** Buyo: a friendly azure robot (Base-blue family). */
const BUYO_COLORS: Palette = {
  C: "#1f9bff",
  E: "#0064c8",
  H: "#7fd0ff",
  A: "#bfeaff",
};

/** Sella: a teal robot, clearly distinct from Buyo. */
const SELLA_COLORS: Palette = {
  C: "#16b9a0",
  E: "#0e8c78",
  H: "#6fe0cd",
  A: "#c4fff3",
};

// --- heads (rows 0-13) carry each robot's identity -----------------------
const headBuyo: SpriteMap = [
  "........................",
  "...........KK...........",
  "..........KAAK..........",
  "...........KK...........",
  ".......KKKKKKKKKK.......",
  "......KCCCCCCCCCCK......",
  "......KCWWWWWWWWCK......",
  "......KCWKKWWKKWCK......",
  "......KCWKKWWKKWCK......",
  "......KCWWWWWWWWCK......",
  "......KCWKWWWWKWCK......",
  "......KCWWKKKKWWCK......",
  "......KCCCCCCCCCCK......",
  ".......KKKKKKKKKK.......",
];

const headSella: SpriteMap = [
  "........................",
  ".......A......A.........",
  ".......K......K.........",
  ".......KK....KK.........",
  ".......KKKKKKKKKK.......",
  "......KCCCCCCCCCCK......",
  "......KCWWWWWWWWCK......",
  "......KCWKWWWWKWCK......",
  "......KCWKWWWWKWCK......",
  "......KCWWWWWWWWCK......",
  "......KCWWWWWWWWCK......",
  "......KCWWKKKKWWCK......",
  "......KCCCCCCCCCCK......",
  ".......KKKKKKKKKK.......",
];

// --- shared neck + shoulders (rows 14-15) ---------------------------------
const neck: SpriteMap = [
  ".........KKKKKK.........",
  "......KKKKKKKKKKKK......",
];

// --- body poses (rows 16-29): torso + arms + legs -------------------------
const bodyStand: SpriteMap = [
  "....KK.KCCCCCCCCK.KK....",
  "....KK.KCHHHHHHCK.KK....",
  "....KK.KCCCCCCCCK.KK....",
  "....KK.KCCCCCCCCK.KK....",
  ".......KCCCCCCCCK.......",
  ".......KCCCCCCCCK.......",
  ".......KCCCCCCCCK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  ".......KKKK..KKKK.......",
];

const bodyWalkA: SpriteMap = [
  "....KK.KCCCCCCCCK.KK....",
  "....KK.KCHHHHHHCK.KK....",
  "....KK.KCCCCCCCCK.KK....",
  ".......KCCCCCCCCK.KK....",
  ".......KCCCCCCCCK.KK....",
  ".......KCCCCCCCCK.......",
  ".......KCCCCCCCCK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  ".......KK......KK.......",
  ".......KK......KK.......",
  "......KK........KK......",
  "......KKK......KKK......",
];

const bodyWalkB: SpriteMap = [
  "....KK.KCCCCCCCCK.KK....",
  "....KK.KCHHHHHHCK.KK....",
  "....KK.KCCCCCCCCK.KK....",
  "....KK.KCCCCCCCCK.......",
  "....KK.KCCCCCCCCK.......",
  ".......KCCCCCCCCK.......",
  ".......KCCCCCCCCK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KKK..KKK........",
  "........KKKKKKKK........",
];

const compose = (head: SpriteMap, body: SpriteMap): SpriteMap => [...head, ...neck, ...body];

export const ACTORS = {
  buyo: {
    palette: { ...BASE, ...BUYO_COLORS },
    stand: compose(headBuyo, bodyStand),
    walk: [compose(headBuyo, bodyWalkA), compose(headBuyo, bodyWalkB)],
  },
  sella: {
    palette: { ...BASE, ...SELLA_COLORS },
    stand: compose(headSella, bodyStand),
    walk: [compose(headSella, bodyWalkA), compose(headSella, bodyWalkB)],
  },
} as const;

/** Resize `canvas` to fit `map` and draw it with `palette`. */
export function drawSprite(canvas: HTMLCanvasElement, map: SpriteMap, palette: Palette): void {
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
      const color = palette[row[x]] ?? "transparent";
      if (color === "transparent") continue;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, 1, 1);
    }
  }
}

/** Create a canvas already drawn with `map` + `palette`. */
export function createSpriteCanvas(map: SpriteMap, palette: Palette): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.className = "pixel-canvas";
  drawSprite(canvas, map, palette);
  return canvas;
}
