/** Pastel palette and small colour helpers. All colours are `#rrggbb`. */

/** Soft near-black used for every outline and label, never pure black. */
export const INK = '#2b2733';
export const PAPER = '#fffaf0';

export const PASTELS = {
  peach: '#ffc8a8',
  mint: '#b8ecd0',
  lilac: '#d7c4f2',
  butter: '#fff0a8',
  sky: '#b8e0f7',
  rose: '#ffc2d4',
  sage: '#c9dfb4',
} as const;

type Rgb = [number, number, number];

function parseHex(hex: string): Rgb | null {
  const m = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  let s = m[1]!;
  if (s.length === 3) s = s[0]! + s[0]! + s[1]! + s[1]! + s[2]! + s[2]!;
  const n = parseInt(s, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  const c = (v: number) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}

/** Linear mix of two hex colours, t=0 -> a, t=1 -> b. Unparseable input is returned unchanged. */
export function mix(a: string, b: string, t: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  if (!ca || !cb) return a;
  return toHex([ca[0] + (cb[0] - ca[0]) * t, ca[1] + (cb[1] - ca[1]) * t, ca[2] + (cb[2] - ca[2]) * t]);
}

/** Soften a saturated colour (e.g. a server-assigned player colour) toward white. */
export function pastelize(hex: string, t = 0.45): string {
  return mix(hex, '#ffffff', t);
}

/** Darken toward ink, for shading and watercolour edges. */
export function shade(hex: string, t = 0.2): string {
  return mix(hex, INK, t);
}

/** `rgba()` string from a hex colour. */
export function withAlpha(hex: string, alpha: number): string {
  const c = parseHex(hex);
  if (!c) return hex;
  return `rgba(${c[0]}, ${c[1]}, ${c[2]}, ${alpha})`;
}
