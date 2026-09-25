/**
 * Goo blob drawing: wobbly ink-outlined body, squash & stretch with velocity, big eyes that
 * look where you go and blink now and then. World of Goo energy, canvas 2D means.
 */
import { ART } from './config';

export interface GooDraw {
  x: number;
  y: number;
  r: number;
  color: string;
  vx: number;
  vy: number;
  maxSpeed: number;
  /** ms clock for wobble/blink. */
  t: number;
  seed: number;
  /** extra squash impulse 0..1 */
  squish: number;
  alpha?: number;
  lookX: number;
  lookY: number;
}

export function drawGoo(g: CanvasRenderingContext2D, d: GooDraw): void {
  const speed = Math.hypot(d.vx, d.vy);
  const s = Math.min(1, speed / d.maxSpeed);
  const ang = speed > 1 ? Math.atan2(d.vy, d.vx) : Math.atan2(d.lookY, d.lookX);
  const breathe = 1 + 0.03 * Math.sin(d.t / 260 + d.seed);
  const squishPulse = 1 - 0.35 * d.squish;
  const along = (1 + 0.28 * s) * breathe * (2 - squishPulse);
  const perp = (1 - 0.2 * s) * breathe * squishPulse;

  g.save();
  g.globalAlpha = d.alpha ?? 1;

  // ground shadow
  g.fillStyle = 'rgba(0,0,0,0.35)';
  g.beginPath();
  g.ellipse(d.x + 3, d.y + d.r * 0.85, d.r * 0.9, d.r * 0.35, 0, 0, Math.PI * 2);
  g.fill();

  g.translate(d.x, d.y);
  g.rotate(ang);
  g.scale(along, perp);

  // wobbly body path
  const N = 28;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const th = (i / N) * Math.PI * 2;
    const w = 1 + 0.055 * Math.sin(3 * th + d.t / 210 + d.seed) + 0.035 * Math.sin(5 * th - d.t / 160 + d.seed * 2);
    const rr = d.r * w;
    const px = Math.cos(th) * rr;
    const py = Math.sin(th) * rr;
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = d.color;
  g.fill();
  g.lineWidth = 3.5 / Math.max(along, perp);
  g.strokeStyle = ART.ink;
  g.lineJoin = 'round';
  g.stroke();

  // glossy highlight
  g.fillStyle = 'rgba(255,255,255,0.28)';
  g.beginPath();
  g.ellipse(-d.r * 0.3, -d.r * 0.42, d.r * 0.34, d.r * 0.2, -0.5, 0, Math.PI * 2);
  g.fill();

  // eyes (undo the stretch so they stay round-ish)
  g.scale(1 / along, 1 / perp);
  g.rotate(-ang);
  const lookLen = Math.hypot(d.lookX, d.lookY) || 1;
  const lx = (d.lookX / lookLen) * d.r * 0.22;
  const ly = (d.lookY / lookLen) * d.r * 0.22;
  const blinkT = (d.t / 1000 + d.seed) % 3.7;
  const blink = blinkT > 3.55 ? Math.max(0.08, 1 - (blinkT - 3.55) / 0.075) : 1;
  const eyeR = d.r * 0.3;
  for (const side of [-1, 1]) {
    const ex = side * d.r * 0.38 + lx * 0.6;
    const ey = -d.r * 0.15 + ly * 0.6;
    g.fillStyle = '#fffaf0';
    g.beginPath();
    g.ellipse(ex, ey, eyeR, eyeR * blink, 0, 0, Math.PI * 2);
    g.fill();
    g.lineWidth = 2;
    g.strokeStyle = ART.ink;
    g.stroke();
    if (blink > 0.3) {
      g.fillStyle = ART.ink;
      g.beginPath();
      g.ellipse(ex + lx * 0.7, ey + ly * 0.7, eyeR * 0.48, eyeR * 0.48 * blink, 0, 0, Math.PI * 2);
      g.fill();
      g.fillStyle = '#fff';
      g.beginPath();
      g.arc(ex + lx * 0.7 - eyeR * 0.18, ey + ly * 0.7 - eyeR * 0.2, eyeR * 0.13, 0, Math.PI * 2);
      g.fill();
    }
  }
  g.restore();
}

/** Hand-lettered, slightly tilted label with ink shadow. */
export function gooText(
  g: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  size: number,
  color: string = ART.paper,
  tilt = -0.03,
  align: CanvasTextAlign = 'center',
): void {
  g.save();
  g.translate(x, y);
  g.rotate(tilt);
  g.font = `bold ${size}px ${ART.font}`;
  g.textAlign = align;
  g.textBaseline = 'middle';
  g.lineJoin = 'round';
  g.lineWidth = Math.max(3, size * 0.14);
  g.strokeStyle = ART.ink;
  g.strokeText(text, 0, 0);
  g.fillStyle = color;
  g.fillText(text, 0, 0);
  g.restore();
}

/** Wobbly rounded card with ink outline. */
export function gooCard(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, t: number, fill = 'rgba(38,35,30,0.92)'): void {
  const N = 40;
  g.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = i / N;
    const th = u * Math.PI * 2;
    // superellipse-ish outline with slow wobble
    const cx = Math.cos(th);
    const cy = Math.sin(th);
    const k = 0.72;
    const px = x + w / 2 + Math.sign(cx) * Math.abs(cx) ** k * (w / 2) * (1 + 0.012 * Math.sin(6 * th + t / 700));
    const py = y + h / 2 + Math.sign(cy) * Math.abs(cy) ** k * (h / 2) * (1 + 0.012 * Math.cos(5 * th + t / 900));
    if (i === 0) g.moveTo(px, py);
    else g.lineTo(px, py);
  }
  g.closePath();
  g.fillStyle = fill;
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = ART.ink;
  g.stroke();
}

export function darken(hex: string, amt = 0.35): string {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const f = (h: string) => Math.round(parseInt(h, 16) * (1 - amt));
  return `rgb(${f(m[1]!)},${f(m[2]!)},${f(m[3]!)})`;
}
