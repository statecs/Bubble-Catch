/**
 * Hand-drawn primitives: wobbly shapes, sketchy double-pass ink outlines,
 * layered watercolour fills and a chalky grain texture.
 * Shapes are point lists so the same outline can be filled, jittered and stroked.
 */
import { INK, shade, withAlpha } from './palette';
import { range, type Rng } from './rng';

export interface Pt {
  x: number;
  y: number;
}

/** Points around an ellipse with a seeded radial wobble (fraction of the radius). */
export function blobPoints(cx: number, cy: number, rx: number, ry: number, rng: Rng, wobble = 0.05, n = 18): Pt[] {
  const pts: Pt[] = [];
  const phase = rng() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = phase + (i / n) * Math.PI * 2;
    const k = 1 + range(rng, -wobble, wobble);
    pts.push({ x: cx + Math.cos(a) * rx * k, y: cy + Math.sin(a) * ry * k });
  }
  return pts;
}

/** Egg shape: narrower at the top, like the cat reference. */
export function eggPoints(cx: number, cy: number, rx: number, ry: number, rng: Rng, wobble = 0.035, n = 22): Pt[] {
  const pts: Pt[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    const s = Math.sin(a); // -1 top, +1 bottom
    const widen = s < 0 ? 1 + s * 0.14 : 1 + s * 0.04;
    const k = 1 + range(rng, -wobble, wobble);
    pts.push({ x: cx + Math.cos(a) * rx * widen * k, y: cy + s * ry * k });
  }
  return pts;
}

/** Nudge every point by up to `amount` px. */
export function jitter(pts: Pt[], rng: Rng, amount: number): Pt[] {
  return pts.map((p) => ({ x: p.x + range(rng, -amount, amount), y: p.y + range(rng, -amount, amount) }));
}

/** Smooth curve through points (quadratic through midpoints). */
export function smoothPath(pts: Pt[], closed = true): Path2D {
  const p = new Path2D();
  const n = pts.length;
  if (n < 2) return p;
  if (!closed) {
    p.moveTo(pts[0]!.x, pts[0]!.y);
    for (let i = 1; i < n - 1; i++) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      p.quadraticCurveTo(a.x, a.y, (a.x + b.x) / 2, (a.y + b.y) / 2);
    }
    p.lineTo(pts[n - 1]!.x, pts[n - 1]!.y);
    return p;
  }
  const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
  const start = mid(pts[n - 1]!, pts[0]!);
  p.moveTo(start.x, start.y);
  for (let i = 0; i < n; i++) {
    const a = pts[i]!;
    const m = mid(a, pts[(i + 1) % n]!);
    p.quadraticCurveTo(a.x, a.y, m.x, m.y);
  }
  p.closePath();
  return p;
}

/** Sketchy outline: a main stroke plus a thinner, slightly offset second pass. */
export function inkOutline(g: CanvasRenderingContext2D, pts: Pt[], rng: Rng, width = 3, closed = true, color = INK): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke(smoothPath(pts, closed));
  g.globalAlpha *= 0.55;
  g.lineWidth = width * 0.45;
  g.stroke(smoothPath(jitter(pts, rng, width * 0.45), closed));
  g.restore();
}

/** Single sketchy line through a few points (whiskers, veins, grass). */
export function inkLine(g: CanvasRenderingContext2D, pts: Pt[], width = 2, color = INK): void {
  g.save();
  g.lineCap = 'round';
  g.lineJoin = 'round';
  g.strokeStyle = color;
  g.lineWidth = width;
  g.stroke(smoothPath(pts, false));
  g.restore();
}

/** Watercolour: several translucent, slightly shifted fills and a darker pooled edge. */
export function watercolourFill(g: CanvasRenderingContext2D, pts: Pt[], colour: string, rng: Rng, spread = 1.5): void {
  g.save();
  g.fillStyle = colour;
  g.globalAlpha *= 0.85;
  g.fill(smoothPath(pts));
  g.globalAlpha = 0.28;
  for (let i = 0; i < 3; i++) g.fill(smoothPath(jitter(pts, rng, spread)));
  g.globalAlpha = 0.3;
  g.strokeStyle = shade(colour, 0.25);
  g.lineWidth = 2;
  g.stroke(smoothPath(pts));
  g.restore();
}

/** Opaque flat fill: for bodies that must not show what is behind them. */
export function solidFill(g: CanvasRenderingContext2D, pts: Pt[], colour: string): void {
  g.save();
  g.fillStyle = colour;
  g.fill(smoothPath(pts));
  g.restore();
}

let grainTile: HTMLCanvasElement | null = null;
const grainPatterns = new WeakMap<CanvasRenderingContext2D, CanvasPattern>();

function makeGrainTile(): HTMLCanvasElement {
  const size = 128;
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const g = c.getContext('2d')!;
  const img = g.createImageData(size, size);
  let seed = 1234567;
  const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = rnd();
    if (r < 0.18) {
      // dark speck
      img.data[i] = 43;
      img.data[i + 1] = 39;
      img.data[i + 2] = 51;
      img.data[i + 3] = Math.round(rnd() * 70);
    } else if (r < 0.32) {
      // chalky light speck
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = Math.round(rnd() * 120);
    }
  }
  g.putImageData(img, 0, 0);
  return c;
}

function grainPattern(g: CanvasRenderingContext2D): CanvasPattern | null {
  let p = grainPatterns.get(g);
  if (p) return p;
  grainTile ??= makeGrainTile();
  p = g.createPattern(grainTile, 'repeat') ?? undefined;
  if (p) grainPatterns.set(g, p);
  return p ?? null;
}

/** Chalky paper grain over a shape (or the whole canvas when `pts` is omitted). */
export function applyGrain(g: CanvasRenderingContext2D, strength = 0.6, pts?: Pt[]): void {
  const pattern = grainPattern(g);
  if (!pattern) return;
  g.save();
  if (pts) g.clip(smoothPath(pts));
  g.globalAlpha *= strength;
  g.fillStyle = pattern;
  g.fillRect(-4096, -4096, 8192, 8192);
  g.restore();
}

/** Soft blush / shading dab. */
export function softDab(g: CanvasRenderingContext2D, x: number, y: number, r: number, colour: string, alpha = 0.45): void {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, withAlpha(colour, alpha));
  grad.addColorStop(1, withAlpha(colour, 0));
  g.save();
  g.fillStyle = grad;
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
  g.fill();
  g.restore();
}
