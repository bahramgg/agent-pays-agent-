// Pixel-art sprite system.
// Each sprite is a grid of characters; every char maps to one flat color in
// PALETTE. Sprites are drawn at native resolution onto a <canvas>, then scaled
// up by CSS with image-rendering: pixelated so every pixel stays a hard square.
// No gradients, no blur — strictly flat color cells.

/** Flat color legend. Base palette dominates; greys are only for the device,
 *  gold is only for coins. */
const PALETTE: Record<string, string> = {
  ".": "transparent",
  K: "#0a0b0d", // near-black outline
  B: "#0052ff", // Base Blue (dominant)
  D: "#0040c8", // flat darker blue
  L: "#3d7bff", // flat lighter blue highlight
  W: "#ffffff", // white
  S: "#1b1e24", // device steel (dark)
  G: "#2b2f36", // device steel (light edge / button)
  Y: "#f5b301", // coin gold (accent only)
};

export type SpriteMap = string[];

/** Agent A — the Buyer. Faces right, light-blue chest panel, center antenna. */
const agentA: SpriteMap = [
  "................",
  "......KKKK......",
  "......KLLK......",
  "....KKKKKKKK....",
  "...KBBBBBBBBK...",
  "...KBWWWWWWBK...",
  "...KBWKWWKWBK...",
  "...KBWWWWWWBK...",
  "...KBBBBBBBBK...",
  "....KKKKKKKK....",
  ".....KK..KK.....",
  "...KKKKKKKKKK...",
  "..KBBBLLLLBBBK..",
  "..KBBBBBBBBBBK..",
  "..KBBBBBBBBBBK..",
  "...KK......KK...",
];

/** Agent B — the Seller. White chest panel, offset antenna so it reads as a
 *  distinct unit from Agent A. */
const agentB: SpriteMap = [
  "................",
  "........KKKK....",
  "........KLLK....",
  "....KKKKKKKK....",
  "...KBBBBBBBBK...",
  "...KBWWWWWWBK...",
  "...KBWKWWKWBK...",
  "...KBWWWWWWBK...",
  "...KBBBBBBBBK...",
  "....KKKKKKKK....",
  ".....KK..KK.....",
  "...KKKKKKKKKK...",
  "..KBBBWWWWBBBK..",
  "..KBBBBBBBBBBK..",
  "..KBBBBBBBBBBK..",
  "...KK......KK...",
];

/** Weather Oracle service icon: gold sun behind a white cloud. */
const weather: SpriteMap = [
  "................",
  "....Y.....Y.....",
  ".....Y...Y......",
  "......YYYY......",
  ".....YYYYYY.....",
  "..Y.YYYYYYYY.Y..",
  "....YYYWWWWYY...",
  ".Y.YYWWWWWWYY.Y.",
  "....YWWWWWWWW...",
  ".....WWWWWWWW...",
  "...WWWWWWWWWWW..",
  "..WWWWWWWWWWWWW.",
  "..WWWWWWWWWWWWW.",
  "...WWWWWWWWWWW..",
  "................",
  "................",
];

/** Ledger hardware device. Steel body with a recessed near-black screen
 *  (the DOM overlay draws the lit screen + text on top) and a side button. */
const ledger: SpriteMap = [
  "........................",
  ".KKKKKKKKKKKKKKKKKKKKKK.",
  ".KSSSSSSSSSSSSSSSSSSSSK.",
  ".KSKKKKKKKKKKKKKKKSGGSK.",
  ".KSKKKKKKKKKKKKKKKSGGSK.",
  ".KSKKKKKKKKKKKKKKKSGGSK.",
  ".KSKKKKKKKKKKKKKKKSGGSK.",
  ".KSSSSSSSSSSSSSSSSSSSSK.",
  ".KKKKKKKKKKKKKKKKKKKKKK.",
  "........................",
];

/** Facilitator node: a little server / block stack with status lights. */
const facilitator: SpriteMap = [
  "................",
  "...KKKKKKKKKK...",
  "..KBBBBBBBBBBK..",
  "..KBWWBWWBWWBK..",
  "..KBBBBBBBBBBK..",
  "...KKKKKKKKKK...",
  "..KBBBBBBBBBBK..",
  "..KBWWBWWBWWBK..",
  "..KBBBBBBBBBBK..",
  "...KKKKKKKKKK...",
  "................",
  "................",
];

/** A "block" that pops in when the facilitator settles on Base. */
const block: SpriteMap = [
  "...KKKKKK...",
  "..KBBBBBBK..",
  ".KBLLLLLLBK.",
  ".KBLWWWWLBK.",
  ".KBLWBBWLBK.",
  ".KBLWBBWLBK.",
  ".KBLWWWWLBK.",
  ".KBLLLLLLBK.",
  ".KBBBBBBBBK.",
  "..KBBBBBBK..",
  "...KKKKKK...",
  "............",
];

/** Request packet (envelope) that travels A -> B. */
const request: SpriteMap = [
  "............",
  ".KKKKKKKKKK.",
  ".KWWWWWWWWK.",
  ".KKWWWWWWKK.",
  ".KWKWWWWKWK.",
  ".KWWKKKKWWK.",
  ".KWWWWWWWWK.",
  ".KKKKKKKKKK.",
  "............",
];

/** EIP-712 / EIP-3009 authorization, drawn as a little scroll / ticket. */
const ticket: SpriteMap = [
  "............",
  ".KKKKKKKKKK.",
  ".KWWWWWWWWK.",
  ".KWBBBBBBWK.",
  ".KWWWWWWWWK.",
  ".KWBBBBWWWK.",
  ".KWBBWWWWWK.",
  ".KWWWWWWWWK.",
  ".KKKKKKKKKK.",
  "............",
];

/** Gold coin (the USDC payment value, clearly fake). */
const coin: SpriteMap = [
  "..KKKKKK..",
  ".KYYYYYYK.",
  "KYYWWWWYYK",
  "KYWYYYYWYK",
  "KYWYKKYWYK",
  "KYWYKKYWYK",
  "KYWYYYYWYK",
  "KYYWWWWYYK",
  ".KYYYYYYK.",
  "..KKKKKK..",
];

/** Delivered weather data (small sun) that travels B -> A at the end. */
const data: SpriteMap = [
  "..Y....Y..",
  "...Y..Y...",
  "..YYYYYY..",
  ".YYYYYYYY.",
  "YYYYYYYYYY",
  "YYYYYYYYYY",
  ".YYYYYYYY.",
  "..YYYYYY..",
  "...Y..Y...",
  "..Y....Y..",
];

export const SPRITES = {
  agentA,
  agentB,
  weather,
  ledger,
  facilitator,
  block,
  request,
  ticket,
  coin,
  data,
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
