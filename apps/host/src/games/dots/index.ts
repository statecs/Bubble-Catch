/**
 * Dots: placeholder game proving the input loop end to end.
 * Each player is a coloured dot steered by their stick. A = ring, B = smaller.
 */
import { ZERO_INPUT, type Player, type PlayerId } from '@party/contract';
import type { GameContext, GameModule } from '../../game/GameModule';

const RADIUS = 18;
const SMALL_RADIUS = 10;
const SPEED = 300; // css px / s

interface Dot {
  x: number;
  y: number;
}

let ctx: GameContext | null = null;
let canvas: HTMLCanvasElement | null = null;
let g2d: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let raf = 0;
let lastT = 0;
let width = 0;
let height = 0;
const dots = new Map<PlayerId, Dot>();

function spawn(): Dot {
  const w = Math.max(width, RADIUS * 2);
  const h = Math.max(height, RADIUS * 2);
  return {
    x: RADIUS + Math.random() * (w - RADIUS * 2),
    y: RADIUS + Math.random() * (h - RADIUS * 2),
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function resize(): void {
  if (!ctx || !canvas || !g2d) return;
  const rect = ctx.container.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!ctx || !g2d) return;
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
  lastT = now;

  // Keep dots in sync with the roster (covers setRoster after a room reclaim,
  // which does not fire onPlayerJoin).
  for (const id of ctx.players.keys()) if (!dots.has(id)) dots.set(id, spawn());
  for (const id of dots.keys()) if (!ctx.players.has(id)) dots.delete(id);

  g2d.clearRect(0, 0, width, height);
  g2d.textAlign = 'center';
  g2d.textBaseline = 'top';
  g2d.font = '600 16px system-ui, sans-serif';

  for (const [id, dot] of dots) {
    const player = ctx.players.get(id);
    if (!player) continue;
    const input = ctx.inputs.get(id) ?? ZERO_INPUT;
    const r = input.buttons.b ? SMALL_RADIUS : RADIUS;

    dot.x = clamp(dot.x + input.axis.x * SPEED * dt, r, Math.max(r, width - r));
    dot.y = clamp(dot.y + input.axis.y * SPEED * dt, r, Math.max(r, height - r));

    g2d.globalAlpha = player.connected ? 1 : 0.4;
    g2d.fillStyle = player.color;
    g2d.beginPath();
    g2d.arc(dot.x, dot.y, r, 0, Math.PI * 2);
    g2d.fill();

    if (input.buttons.a) {
      g2d.strokeStyle = player.color;
      g2d.lineWidth = 3;
      g2d.beginPath();
      g2d.arc(dot.x, dot.y, r + 10, 0, Math.PI * 2);
      g2d.stroke();
    }

    g2d.fillStyle = '#f1f5f9';
    g2d.fillText(player.name, dot.x, dot.y + RADIUS + 8);
  }
  g2d.globalAlpha = 1;
}

export const DotsGame: GameModule = {
  id: 'dots',
  name: 'Dots',

  mount(c: GameContext): void {
    ctx = c;
    canvas = document.createElement('canvas');
    canvas.style.display = 'block';
    c.container.appendChild(canvas);
    g2d = canvas.getContext('2d');
    ro = new ResizeObserver(resize);
    ro.observe(c.container);
    resize();
    lastT = 0;
    raf = requestAnimationFrame(frame);
  },

  unmount(): void {
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    ro = null;
    canvas?.remove();
    canvas = null;
    g2d = null;
    ctx = null;
    dots.clear();
  },

  onPlayerJoin(player: Player): void {
    if (!dots.has(player.id)) dots.set(player.id, spawn());
    ctx?.sendToPlayer(player.id, { text: 'You are in!', vibrate: 80 });
  },

  onPlayerLeave(player: Player): void {
    dots.delete(player.id);
  },
};
