// Walking actors. Each actor owns one canvas and swaps between a standing pose
// and a 2-frame walk cycle, drawn with its own palette. Movement across the
// stage is done by the engine (it animates the actor's transform).

import { ACTORS, createSpriteCanvas, drawSprite, type Palette, type SpriteMap } from "./sprites.js";

export type ActorName = keyof typeof ACTORS;

export class SpriteActor {
  private canvas: HTMLCanvasElement;
  private palette: Palette;
  private stand: SpriteMap;
  private frames: readonly SpriteMap[];
  private timer: number | null = null;
  private idx = 0;

  constructor(host: HTMLElement, name: ActorName) {
    const actor = ACTORS[name];
    this.palette = actor.palette;
    this.stand = actor.stand;
    this.frames = actor.walk;
    this.canvas = createSpriteCanvas(this.stand, this.palette);
    host.appendChild(this.canvas);
  }

  startWalk(intervalMs = 150): void {
    this.stopWalk();
    this.idx = 0;
    this.timer = window.setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length;
      drawSprite(this.canvas, this.frames[this.idx], this.palette);
    }, intervalMs);
  }

  stopWalk(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    drawSprite(this.canvas, this.stand, this.palette);
  }
}
