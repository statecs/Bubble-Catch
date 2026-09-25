/**
 * Background: a top-down pastel meadow on paper. Baked once per size; blit each frame.
 */
import { INK, PASTELS, mix, shade, withAlpha } from './palette';
import { applyGrain, blobPoints, inkLine, inkOutline, smoothPath, solidFill, watercolourFill } from './ink';
import { drawCollectible } from './collectibles';
import { makeCanvas } from './sprites';
import { mulberry32, range, type Rng } from './rng';

const GROUND = '#eef6dc';

function grassTuft(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const colour = shade(PASTELS.sage, 0.45);
  for (let i = -1; i <= 1; i++) {
    const lean = i * s * 0.35 + range(rng, -2, 2);
    inkLine(g, [
      { x: x + i * s * 0.2, y },
      { x: x + i * s * 0.2 + lean * 0.4, y: y - s * 0.5 },
      { x: x + i * s * 0.2 + lean, y: y - s * range(rng, 0.8, 1.1) },
    ], 1.6, colour);
  }
}

function pebble(g: CanvasRenderingContext2D, x: number, y: number, s: number, rng: Rng): void {
  const pts = blobPoints(x, y, s, s * 0.7, rng, 0.12, 10);
  solidFill(g, pts, mix(PASTELS.lilac, '#ffffff', 0.4));
  g.globalAlpha = 0.6;
  inkOutline(g, pts, rng, 1.4);
  g.globalAlpha = 1;
}

/** Bake the meadow for a `w` x `h` css-px area. Same seed + size = same picture. */
export function bakeBackground(w: number, h: number, dpr: number, seed = 7): HTMLCanvasElement {
  const { canvas, g } = makeCanvas(w, h, dpr);
  const rng = mulberry32(seed);
  const area = w * h;

  g.fillStyle = GROUND;
  g.fillRect(0, 0, w, h);

  // large soft watercolour washes
  const washes = [PASTELS.mint, PASTELS.sage, PASTELS.butter, PASTELS.sky, PASTELS.mint];
  const nWash = Math.max(6, Math.round(area / 60000));
  for (let i = 0; i < nWash; i++) {
    const r = range(rng, 0.12, 0.28) * Math.max(w, h);
    const pts = blobPoints(rng() * w, rng() * h, r, r * range(rng, 0.55, 0.9), rng, 0.12, 16);
    g.globalAlpha = 0.35;
    watercolourFill(g, pts, washes[i % washes.length]!, rng, r * 0.04);
  }
  g.globalAlpha = 1;

  // a pond, somewhere off-centre, as a landmark
  {
    const r = Math.min(w, h) * 0.11;
    const cx = rng() < 0.5 ? w * 0.18 : w * 0.82;
    const cy = rng() < 0.5 ? h * 0.2 : h * 0.8;
    const pts = blobPoints(cx, cy, r * 1.4, r, rng, 0.08, 18);
    watercolourFill(g, pts, PASTELS.sky, rng, 3);
    g.globalAlpha = 0.7;
    inkOutline(g, pts, rng, 2.2);
    g.globalAlpha = 1;
    g.strokeStyle = 'rgba(255,255,255,0.8)';
    g.lineWidth = 2;
    g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      g.beginPath();
      const rx = cx + range(rng, -r * 0.7, r * 0.5);
      const ry = cy + range(rng, -r * 0.5, r * 0.5);
      g.moveTo(rx, ry);
      g.lineTo(rx + r * 0.3, ry);
      g.stroke();
    }
  }

  // grass tufts, pebbles, loose leaves and flowers (decor only, not collectible)
  const nTuft = Math.round(area / 7000);
  for (let i = 0; i < nTuft; i++) grassTuft(g, rng() * w, rng() * h, range(rng, 8, 14), rng);
  const nPebble = Math.round(area / 50000);
  for (let i = 0; i < nPebble; i++) pebble(g, rng() * w, rng() * h, range(rng, 4, 8), rng);

  const decor = Math.round(area / 45000);
  for (let i = 0; i < decor; i++) {
    const s = range(rng, 12, 20);
    g.save();
    g.globalAlpha = 0.5;
    g.translate(rng() * w - s / 2, rng() * h - s / 2);
    drawCollectible(g, rng() < 0.5 ? 'flower' : 'leaf', s, Math.floor(rng() * 1e9));
    g.restore();
  }

  applyGrain(g, 0.5);

  // paper vignette
  const vg = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.75);
  vg.addColorStop(0, withAlpha(INK, 0));
  vg.addColorStop(1, withAlpha(INK, 0.12));
  g.fillStyle = vg;
  g.fillRect(0, 0, w, h);

  // hand-drawn frame
  g.globalAlpha = 0.5;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  const m = 7;
  const corners = [{ x: m, y: m }, { x: w - m, y: m }, { x: w - m, y: h - m }, { x: m, y: h - m }];
  const edge: { x: number; y: number }[] = [];
  for (let i = 0; i < 4; i++) {
    const a = corners[i]!;
    const b = corners[(i + 1) % 4]!;
    const steps = Math.max(4, Math.round(Math.hypot(b.x - a.x, b.y - a.y) / 60));
    for (let k = 0; k < steps; k++) {
      const t = k / steps;
      const j = k === 0 ? 0 : range(rng, -1.5, 1.5);
      edge.push({ x: a.x + (b.x - a.x) * t + j, y: a.y + (b.y - a.y) * t + j });
    }
  }
  g.stroke(smoothPath(edge));
  g.globalAlpha = 1;

  return canvas;
}
