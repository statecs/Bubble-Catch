/**
 * Things animals collect. Each draws centred in a `size` x `size` box from (0, 0).
 * Bubbles are translucent with an iridescent rim; the rest are watercolour nature bits.
 */
import { INK, PASTELS, mix, shade, withAlpha } from './palette';
import { applyGrain, blobPoints, inkLine, inkOutline, smoothPath, softDab, solidFill, watercolourFill, type Pt } from './ink';
import { hashSeed, mulberry32, range } from './rng';

export type CollectibleKind = 'bubble' | 'leaf' | 'berry' | 'flower';

export const COLLECTIBLE_KINDS: readonly CollectibleKind[] = ['bubble', 'leaf', 'berry', 'flower'];

/** Short label for phone text. */
export const COLLECTIBLE_EMOJI: Record<CollectibleKind, string> = {
  bubble: '🫧',
  leaf: '🍃',
  berry: '🍓',
  flower: '🌸',
};

/** Dominant colour, used for pop particles. */
export const COLLECTIBLE_COLOUR: Record<CollectibleKind, string> = {
  bubble: PASTELS.sky,
  leaf: '#a9cf8f',
  berry: '#ff7f9e',
  flower: PASTELS.butter,
};

const LEAF_GREEN = '#a9cf8f';

function bubble(g: CanvasRenderingContext2D, r: number, seed: number): void {
  const rng = mulberry32(seed);
  const body = g.createRadialGradient(-r * 0.25, -r * 0.3, r * 0.1, 0, 0, r);
  body.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
  body.addColorStop(0.7, withAlpha(PASTELS.sky, 0.22));
  body.addColorStop(1, withAlpha(PASTELS.lilac, 0.55));
  g.fillStyle = body;
  g.beginPath();
  g.arc(0, 0, r, 0, Math.PI * 2);
  g.fill();

  const rim = g.createConicGradient(rng() * Math.PI * 2, 0, 0);
  const stops = [PASTELS.rose, PASTELS.butter, PASTELS.mint, PASTELS.sky, PASTELS.lilac, PASTELS.rose];
  stops.forEach((c, i) => rim.addColorStop(i / (stops.length - 1), c));
  g.strokeStyle = rim;
  g.lineWidth = r * 0.14;
  g.beginPath();
  g.arc(0, 0, r * 0.92, 0, Math.PI * 2);
  g.stroke();

  g.globalAlpha = 0.55;
  inkOutline(g, blobPoints(0, 0, r, r, rng, 0.02, 20), rng, 1.6);
  g.globalAlpha = 1;

  // highlight: a bright arc and a small dot, top-left
  g.strokeStyle = 'rgba(255, 255, 255, 0.95)';
  g.lineCap = 'round';
  g.lineWidth = r * 0.13;
  g.beginPath();
  g.arc(0, 0, r * 0.68, Math.PI * 1.08, Math.PI * 1.42);
  g.stroke();
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.arc(-r * 0.2, -r * 0.62, r * 0.08, 0, Math.PI * 2);
  g.fill();
}

function leafPoints(len: number, wid: number): Pt[] {
  const pts: Pt[] = [];
  const n = 10;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    pts.push({ x: -len / 2 + t * len, y: -Math.sin(Math.PI * t) * wid * (1 - t * 0.25) });
  }
  for (let i = n - 1; i > 0; i--) {
    const t = i / n;
    pts.push({ x: -len / 2 + t * len, y: Math.sin(Math.PI * t) * wid * (1 - t * 0.25) });
  }
  return pts;
}

function leaf(g: CanvasRenderingContext2D, r: number, seed: number): void {
  const rng = mulberry32(seed);
  g.rotate(range(rng, -0.9, -0.4));
  const pts = leafPoints(r * 1.9, r * 0.55);
  watercolourFill(g, pts, LEAF_GREEN, rng, r * 0.05);
  applyGrain(g, 0.45, pts);
  softDab(g, r * 0.2, r * 0.1, r * 0.6, shade(LEAF_GREEN, 0.3), 0.25);
  const vein = shade(LEAF_GREEN, 0.55);
  inkLine(g, [{ x: -r * 1.2, y: r * 0.05 }, { x: -r * 0.95, y: 0 }, { x: r * 0.9, y: 0 }], r * 0.07, vein);
  for (let i = 1; i <= 4; i++) {
    const x = -r * 0.8 + i * r * 0.34;
    for (const side of [-1, 1]) {
      inkLine(g, [{ x, y: 0 }, { x: x + r * 0.22, y: side * r * 0.32 * (1 - i * 0.12) }], r * 0.035, vein);
    }
  }
  g.globalAlpha = 0.7;
  inkOutline(g, pts, rng, r * 0.06, true, shade(LEAF_GREEN, 0.6));
  g.globalAlpha = 1;
}

function berry(g: CanvasRenderingContext2D, r: number, seed: number): void {
  const rng = mulberry32(seed);
  const red = '#ff7f9e';
  const spots: [number, number][] = [[-0.32, 0.2], [0.32, 0.2], [0, -0.18]];
  for (const [dx, dy] of spots) {
    const pts = blobPoints(dx * r, dy * r, r * 0.42, r * 0.42, rng, 0.05, 12);
    solidFill(g, pts, red);
    watercolourFill(g, pts, red, rng, r * 0.03);
    applyGrain(g, 0.4, pts);
    inkOutline(g, pts, rng, r * 0.07);
    g.fillStyle = 'rgba(255, 255, 255, 0.85)';
    g.beginPath();
    g.arc(dx * r - r * 0.13, dy * r - r * 0.14, r * 0.08, 0, Math.PI * 2);
    g.fill();
  }
  const l = leafPoints(r * 0.8, r * 0.25).map((p) => ({ x: p.x + r * 0.2, y: p.y - r * 0.62 }));
  solidFill(g, l, LEAF_GREEN);
  inkOutline(g, l, rng, r * 0.06);
  inkLine(g, [{ x: 0, y: -r * 0.55 }, { x: -r * 0.05, y: -r * 0.85 }], r * 0.07);
}

function flower(g: CanvasRenderingContext2D, r: number, seed: number): void {
  const rng = mulberry32(seed);
  const petal = rng() < 0.5 ? PASTELS.rose : PASTELS.lilac;
  const spin = rng() * Math.PI;
  for (let i = 0; i < 5; i++) {
    const a = spin + (i / 5) * Math.PI * 2;
    const cx = Math.cos(a) * r * 0.5;
    const cy = Math.sin(a) * r * 0.5;
    const pts = blobPoints(cx, cy, r * 0.38, r * 0.38, rng, 0.07, 12);
    solidFill(g, pts, petal);
    watercolourFill(g, pts, petal, rng, r * 0.03);
    inkOutline(g, pts, rng, r * 0.06);
  }
  const centre = blobPoints(0, 0, r * 0.3, r * 0.3, rng, 0.06, 12);
  solidFill(g, centre, PASTELS.butter);
  applyGrain(g, 0.5, centre);
  inkOutline(g, centre, rng, r * 0.06);
  g.fillStyle = shade(PASTELS.butter, 0.4);
  for (let i = 0; i < 4; i++) {
    g.beginPath();
    g.arc(range(rng, -0.12, 0.12) * r, range(rng, -0.12, 0.12) * r, r * 0.035, 0, Math.PI * 2);
    g.fill();
  }
}

/** Draw a collectible centred in a `size` box. `seed` varies rotation/colour between instances. */
export function drawCollectible(g: CanvasRenderingContext2D, kind: CollectibleKind, size: number, seed = 0): void {
  const r = size * 0.4;
  const s = hashSeed(kind) ^ seed;
  g.save();
  g.translate(size / 2, size / 2);
  switch (kind) {
    case 'bubble':
      bubble(g, r, s);
      break;
    case 'leaf':
      leaf(g, r, s);
      break;
    case 'berry':
      berry(g, r, s);
      break;
    case 'flower':
      flower(g, r, s);
      break;
  }
  g.restore();
}

/**
 * Collection burst at (x, y), t in [0, 1]. Drawn live (not baked): an expanding
 * wobbly ring plus droplets and sparkle crosses flying out.
 */
export function drawPop(g: CanvasRenderingContext2D, kind: CollectibleKind, x: number, y: number, size: number, t: number, seed = 0): void {
  if (t < 0 || t > 1) return;
  const rng = mulberry32(hashSeed(kind) ^ seed);
  const colour = COLLECTIBLE_COLOUR[kind];
  const ease = 1 - (1 - t) * (1 - t);
  const fade = 1 - t;
  g.save();
  g.translate(x, y);
  g.globalAlpha = fade;

  const ringR = size * (0.35 + ease * 0.5);
  g.strokeStyle = kind === 'bubble' ? '#ffffff' : colour;
  g.lineWidth = Math.max(1, size * 0.08 * fade);
  g.stroke(smoothPath(blobPoints(0, 0, ringR, ringR, rng, 0.06, 14)));

  const n = 7;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + rng() * 0.5;
    const d = size * (0.3 + ease * range(rng, 0.6, 0.95));
    const px = Math.cos(a) * d;
    const py = Math.sin(a) * d;
    if (i % 2 === 0) {
      g.fillStyle = mix(colour, '#ffffff', 0.2);
      g.beginPath();
      g.arc(px, py, size * 0.07 * fade + 1, 0, Math.PI * 2);
      g.fill();
      g.strokeStyle = INK;
      g.lineWidth = 1.2;
      g.stroke();
    } else {
      const s = size * 0.09;
      g.strokeStyle = INK;
      g.lineWidth = 1.6;
      g.lineCap = 'round';
      g.beginPath();
      g.moveTo(px - s, py);
      g.lineTo(px + s, py);
      g.moveTo(px, py - s);
      g.lineTo(px, py + s);
      g.stroke();
    }
  }
  g.restore();
}
