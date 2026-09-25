/**
 * Baked sprites: draw once into an offscreen canvas, blit every frame.
 * This is the single place to swap procedural art for PNGs later.
 */

export type DrawFn = (g: CanvasRenderingContext2D, w: number, h: number) => void;

/** Canvas sized for `dpr`, with its context pre-scaled so drawing uses css px. */
export function makeCanvas(w: number, h: number, dpr: number): { canvas: HTMLCanvasElement; g: CanvasRenderingContext2D } {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(w * dpr));
  canvas.height = Math.max(1, Math.round(h * dpr));
  const g = canvas.getContext('2d')!;
  g.scale(dpr, dpr);
  return { canvas, g };
}

export class SpriteCache {
  private readonly map = new Map<string, HTMLCanvasElement>();

  get(key: string, w: number, h: number, dpr: number, draw: DrawFn): HTMLCanvasElement {
    const k = `${key}@${w}x${h}@${dpr}`;
    let c = this.map.get(k);
    if (!c) {
      const made = makeCanvas(w, h, dpr);
      draw(made.g, w, h);
      c = made.canvas;
      this.map.set(k, c);
    }
    return c;
  }

  clear(): void {
    this.map.clear();
  }
}
