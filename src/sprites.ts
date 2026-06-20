// Pixel-art sprite system.
// A sprite is a grid of characters; each char maps to one flat color in
// PALETTE. Sprites render at native resolution onto a <canvas>, then CSS scales
// them up with image-rendering: pixelated so every pixel stays a hard square.
// No gradients, no blur, no soft shadows -- strictly flat color cells.
//
// Buyo and Sella are proper little robots: antenna, head with a face, a neck,
// a torso with ARMS, and two LEGS with feet. They are NOT boxed in a frame --
// they stand on the stage. Each robot is composed from a head (its identity)
// plus shared neck + body frames; the body has three poses (stand / walkA /
// walkB) whose arms and legs differ, so the walk cycle reads naturally.

const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline / limbs
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue (shade)
  L: "#3d7bff", // flat lighter blue (highlight)
  W: "#ffffff", // white (face / eyes)
  Y: "#f5b301", // gold accent
};

export type SpriteMap = string[];

// --- heads (rows 0-13) carry each robot's identity -----------------------
// Buyo: single center antenna with a light-blue bulb, round eyes.
const headBuyo: SpriteMap = [
  "........................",
  "...........KK...........",
  "..........KLLK..........",
  "...........KK...........",
  ".......KKKKKKKKKK.......",
  "......KBBBBBBBBBBK......",
  "......KBWWWWWWWWBK......",
  "......KBWKKWWKKWBK......",
  "......KBWKKWWKKWBK......",
  "......KBWWWWWWWWBK......",
  "......KBWKWWWWKWBK......",
  "......KBWWKKKKWWBK......",
  "......KBBBBBBBBBBK......",
  ".......KKKKKKKKKK.......",
];

// Sella: two antennae with white bulbs, narrow happy eyes.
const headSella: SpriteMap = [
  "........................",
  ".......W......W.........",
  ".......K......K.........",
  ".......KK....KK.........",
  ".......KKKKKKKKKK.......",
  "......KBBBBBBBBBBK......",
  "......KBWWWWWWWWBK......",
  "......KBWKWWWWKWBK......",
  "......KBWKWWWWKWBK......",
  "......KBWWWWWWWWBK......",
  "......KBWWWWWWWWBK......",
  "......KBWWKKKKWWBK......",
  "......KBBBBBBBBBBK......",
  ".......KKKKKKKKKK.......",
];

// --- shared neck + shoulders (rows 14-15) ---------------------------------
const neck: SpriteMap = [
  ".........KKKKKK.........",
  "......KKKKKKKKKKKK......",
];

// --- body poses (rows 16-29): torso + arms + legs -------------------------
// Arms hang at cols 4-5 (left) and 18-19 (right); torso is cols 7-16.
const bodyStand: SpriteMap = [
  "....KK.KBBBBBBBBK.KK....",
  "....KK.KBLLLLLLBK.KK....",
  "....KK.KBBBBBBBBK.KK....",
  "....KK.KBBBBBBBBK.KK....",
  ".......KBBBBBBBBK.......",
  ".......KBBBBBBBBK.......",
  ".......KBBBBBBBBK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  ".......KKKK..KKKK.......",
];

// Left arm raised, right arm low; legs striding apart.
const bodyWalkA: SpriteMap = [
  "....KK.KBBBBBBBBK.KK....",
  "....KK.KBLLLLLLBK.KK....",
  "....KK.KBBBBBBBBK.KK....",
  ".......KBBBBBBBBK.KK....",
  ".......KBBBBBBBBK.KK....",
  ".......KBBBBBBBBK.......",
  ".......KBBBBBBBBK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  ".......KK......KK.......",
  ".......KK......KK.......",
  "......KK........KK......",
  "......KKK......KKK......",
];

// Right arm raised, left arm low; legs together (planted step).
const bodyWalkB: SpriteMap = [
  "....KK.KBBBBBBBBK.KK....",
  "....KK.KBLLLLLLBK.KK....",
  "....KK.KBBBBBBBBK.KK....",
  "....KK.KBBBBBBBBK.......",
  "....KK.KBBBBBBBBK.......",
  ".......KBBBBBBBBK.......",
  ".......KBBBBBBBBK.......",
  ".......KKKKKKKKKK.......",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KK....KK........",
  "........KKK..KKK........",
  "........KKKKKKKK........",
];

const compose = (head: SpriteMap, body: SpriteMap): SpriteMap => [...head, ...neck, ...body];

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
  buyo: {
    stand: compose(headBuyo, bodyStand),
    walk: [compose(headBuyo, bodyWalkA), compose(headBuyo, bodyWalkB)],
  },
  sella: {
    stand: compose(headSella, bodyStand),
    walk: [compose(headSella, bodyWalkA), compose(headSella, bodyWalkB)],
  },
} as const;

export const SPRITES = { ledgerMark } as const;

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
