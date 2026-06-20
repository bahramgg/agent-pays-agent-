// Walking actors. Each actor owns one canvas and swaps between a standing pose
// and a 2-frame walk cycle. Movement across the stage is done by the engine
// (it animates the actor's transform); this class just drives the leg frames.

import { ACTORS, createSpriteCanvas, drawSprite, type SpriteMap } from "./sprites.js";

export type ActorName = keyof typeof ACTORS;

export class SpriteActor {
  private canvas: HTMLCanvasElement;
  private stand: SpriteMap;
  private frames: readonly SpriteMap[];
  private timer: number | null = null;
  private idx = 0;

  constructor(host: HTMLElement, name: ActorName) {
    this.stand = ACTORS[name].stand;
    this.frames = ACTORS[name].walk;
    this.canvas = createSpriteCanvas(this.stand);
    host.appendChild(this.canvas);
  }

  /** Cycle the walk frames (stepped, whole-frame swaps). */
  startWalk(intervalMs = 150): void {
    this.stopWalk();
    this.idx = 0;
    this.timer = window.setInterval(() => {
      this.idx = (this.idx + 1) % this.frames.length;
      drawSprite(this.canvas, this.frames[this.idx]);
    }, intervalMs);
  }

  /** Stop walking and settle on the standing pose. */
  stopWalk(): void {
    if (this.timer !== null) {
      clearInterval(this.timer);
      this.timer = null;
    }
    drawSprite(this.canvas, this.stand);
  }
}
