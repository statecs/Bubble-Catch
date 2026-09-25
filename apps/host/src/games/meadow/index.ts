/**
 * Meadow: hand-drawn visual showcase. Each player is a distinct animal walking
 * around a pastel meadow collecting bubbles, leaves, berries and flowers.
 * Stick = walk, A = hop, B = dash. All art comes from @party/world.
 */
import { ZERO_INPUT, type Player, type PlayerId } from '@party/contract';
import {
  ANIMALS,
  ANIMAL_BODY_Y,
  ANIMAL_FEET_Y,
  COLLECTIBLE_EMOJI,
  INK,
  PAPER,
  SpriteCache,
  bakeBackground,
  drawAnimal,
  drawCollectible,
  drawPop,
  pastelize,
  repeatBody,
  withAlpha,
  type AnimalPose,
  type CollectibleKind,
  type Species,
} from '@party/world';
import type { GameContext, GameModule } from '../../game/GameModule';

const ANIMAL_SIZE = 116; // css px sprite box
const ITEM_SIZE = 50;
const SPEED = 260; // css px / s
const DASH_MULT = 2.4;
const DASH_TIME = 0.22;
const DASH_COOLDOWN = 0.8;
const HOP_TIME = 0.45;
const HOP_HEIGHT = 30;
const HAPPY_TIME = 0.35;
const POP_TIME = 0.45;
const PUFF_TIME = 0.5;
const COLLECT_DIST = ANIMAL_SIZE * 0.3 + ITEM_SIZE * 0.3;
const SPAWN_EVERY = 0.7; // s between spawns while below target
const FEET = ANIMAL_SIZE * (ANIMAL_FEET_Y - 0.5); // sprite centre -> soles

interface Critter {
  species: Species;
  accent: string;
  body: string | undefined;
  x: number;
  y: number;
  facing: 1 | -1;
  walkT: number;
  hopT: number; // -1 = on the ground
  dashT: number;
  dashCd: number;
  happyT: number;
  puffCd: number;
  prevA: boolean;
  prevB: boolean;
  score: number;
}

interface Item {
  kind: CollectibleKind;
  seed: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  age: number;
}

interface Pop {
  kind: CollectibleKind;
  x: number;
  y: number;
  t: number;
  seed: number;
}

interface Puff {
  x: number;
  y: number;
  t: number;
}

let ctx: GameContext | null = null;
let canvas: HTMLCanvasElement | null = null;
let g2d: CanvasRenderingContext2D | null = null;
let ro: ResizeObserver | null = null;
let raf = 0;
let lastT = 0;
let clock = 0;
let spawnCd = 0;
let width = 0;
let height = 0;
let dpr = 1;
let background: HTMLCanvasElement | null = null;
const sprites = new SpriteCache();
const critters = new Map<PlayerId, Critter>();
let items: Item[] = [];
let pops: Pop[] = [];
let puffs: Puff[] = [];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function bounds() {
  return {
    minX: ANIMAL_SIZE * 0.4,
    maxX: Math.max(ANIMAL_SIZE * 0.4, width - ANIMAL_SIZE * 0.4),
    minY: ANIMAL_SIZE * 0.5,
    maxY: Math.max(ANIMAL_SIZE * 0.5, height - FEET - 30), // leave room for the name sticker
  };
}

/** Least-used species first, in ANIMALS order, so the first 8 players are all different. */
function pickSpecies(): { species: Species; round: number } {
  const counts = new Map<Species, number>();
  for (const c of critters.values()) counts.set(c.species, (counts.get(c.species) ?? 0) + 1);
  let best = ANIMALS[0]!;
  let bestCount = Infinity;
  for (const a of ANIMALS) {
    const n = counts.get(a.id) ?? 0;
    if (n < bestCount) {
      best = a;
      bestCount = n;
    }
  }
  return { species: best.id, round: bestCount };
}

function ensureCritter(player: Player): Critter {
  let c = critters.get(player.id);
  if (c) return c;
  const { species, round } = pickSpecies();
  const spec = ANIMALS.find((a) => a.id === species)!;
  const b = bounds();
  c = {
    species,
    accent: pastelize(player.color, 0.3),
    body: repeatBody(spec, player.color, round),
    x: b.minX + Math.random() * (b.maxX - b.minX),
    y: b.minY + Math.random() * (b.maxY - b.minY),
    facing: Math.random() < 0.5 ? 1 : -1,
    walkT: 0,
    hopT: -1,
    dashT: 0,
    dashCd: 0,
    happyT: 0,
    puffCd: 0,
    prevA: false,
    prevB: false,
    score: 0,
  };
  critters.set(player.id, c);
  return c;
}

function greet(player: Player): void {
  const c = ensureCritter(player);
  const name = ANIMALS.find((a) => a.id === c.species)!.name;
  ctx?.sendToPlayer(player.id, { color: c.accent, text: `You are the ${name}!`, vibrate: 80 });
}

function randomKind(): CollectibleKind {
  const r = Math.random();
  return r < 0.55 ? 'bubble' : r < 0.72 ? 'leaf' : r < 0.86 ? 'berry' : 'flower';
}

function spawnItem(): void {
  const m = ITEM_SIZE;
  let x = 0;
  let y = 0;
  // a few tries to avoid spawning right on top of an animal
  for (let i = 0; i < 8; i++) {
    x = m + Math.random() * Math.max(1, width - m * 2);
    y = m + Math.random() * Math.max(1, height - m * 2);
    let clear = true;
    for (const c of critters.values()) if (Math.hypot(c.x - x, c.y - y) < ANIMAL_SIZE) clear = false;
    if (clear) break;
  }
  const kind = randomKind();
  const drift = kind === 'bubble' ? 18 : 0;
  items.push({
    kind,
    seed: Math.floor(Math.random() * 6), // few variants so the sprite cache stays small
    x,
    y,
    vx: (Math.random() * 2 - 1) * drift,
    vy: (Math.random() * 2 - 1) * drift,
    phase: Math.random() * Math.PI * 2,
    age: 0,
  });
}

function resize(): void {
  if (!ctx || !canvas || !g2d) return;
  const rect = ctx.container.getBoundingClientRect();
  width = rect.width;
  height = rect.height;
  dpr = window.devicePixelRatio || 1;
  canvas.width = Math.max(1, Math.round(width * dpr));
  canvas.height = Math.max(1, Math.round(height * dpr));
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  g2d.setTransform(dpr, 0, 0, dpr, 0, 0);
  background = width > 0 && height > 0 ? bakeBackground(width, height, dpr) : null;
}

function update(dt: number): void {
  if (!ctx) return;
  const b = bounds();

  for (const [id, c] of critters) {
    const player = ctx.players.get(id);
    const input = player?.connected ? (ctx.inputs.get(id) ?? ZERO_INPUT) : ZERO_INPUT;
    const { a, b: bBtn } = input.buttons;

    if (a && !c.prevA && c.hopT < 0) c.hopT = 0;
    if (bBtn && !c.prevB && c.dashCd <= 0) {
      c.dashT = DASH_TIME;
      c.dashCd = DASH_COOLDOWN;
      c.puffCd = 0;
    }
    c.prevA = a;
    c.prevB = bBtn;

    const mag = Math.hypot(input.axis.x, input.axis.y);
    const speed = SPEED * (c.dashT > 0 ? DASH_MULT : 1);
    c.x = clamp(c.x + input.axis.x * speed * dt, b.minX, b.maxX);
    c.y = clamp(c.y + input.axis.y * speed * dt, b.minY, b.maxY);
    if (Math.abs(input.axis.x) > 0.15) c.facing = input.axis.x > 0 ? 1 : -1;
    c.walkT = mag > 0.1 ? c.walkT + dt * (7 + 5 * mag) : 0;

    if (c.hopT >= 0) {
      c.hopT += dt / HOP_TIME;
      if (c.hopT >= 1) c.hopT = -1;
    }
    c.happyT = Math.max(0, c.happyT - dt);
    c.dashCd = Math.max(0, c.dashCd - dt);
    if (c.dashT > 0) {
      c.dashT -= dt;
      c.puffCd -= dt;
      if (c.puffCd <= 0 && mag > 0.1) {
        puffs.push({ x: c.x - c.facing * ANIMAL_SIZE * 0.2, y: c.y + FEET - 4, t: 0 });
        c.puffCd = 0.05;
      }
    }
  }

  // collectibles: spawn toward target, drift, collect
  const connected = [...ctx.players.values()].filter((p) => p.connected).length;
  const target = 3 + connected;
  spawnCd -= dt;
  if (items.length < target && spawnCd <= 0 && width > 0) {
    spawnItem();
    spawnCd = SPAWN_EVERY;
  }

  const m = ITEM_SIZE / 2;
  for (const it of items) {
    it.age += dt;
    it.x += it.vx * dt;
    it.y += it.vy * dt;
    if (it.x < m || it.x > width - m) it.vx = -it.vx;
    if (it.y < m || it.y > height - m) it.vy = -it.vy;
    it.x = clamp(it.x, m, Math.max(m, width - m));
    it.y = clamp(it.y, m, Math.max(m, height - m));
  }

  items = items.filter((it) => {
    if (it.age < 0.3) return true; // let it finish appearing
    for (const [id, c] of critters) {
      if (!ctx!.players.get(id)?.connected) continue;
      if (Math.hypot(c.x - it.x, c.y - it.y) > COLLECT_DIST) continue;
      c.score += 1;
      c.happyT = HAPPY_TIME;
      pops.push({ kind: it.kind, x: it.x, y: it.y, t: 0, seed: Math.floor(Math.random() * 1e6) });
      ctx!.sendToPlayer(id, { text: `${COLLECTIBLE_EMOJI[it.kind]} ${c.score}`, vibrate: 40 });
      return false;
    }
    return true;
  });

  for (const p of pops) p.t += dt / POP_TIME;
  pops = pops.filter((p) => p.t < 1);
  for (const p of puffs) p.t += dt / PUFF_TIME;
  puffs = puffs.filter((p) => p.t < 1);
}

function poseOf(c: Critter): AnimalPose {
  if (c.happyT > 0) return 'happy';
  if (c.walkT > 0) return Math.floor(c.walkT / Math.PI) % 2 === 0 ? 'walkA' : 'walkB';
  return 'idle';
}

function shadow(g: CanvasRenderingContext2D, x: number, y: number, rx: number, alpha: number): void {
  g.fillStyle = withAlpha(INK, alpha);
  g.beginPath();
  g.ellipse(x, y, rx, rx * 0.32, 0, 0, Math.PI * 2);
  g.fill();
}

function sticker(g: CanvasRenderingContext2D, text: string, x: number, y: number, accent: string): void {
  g.font = '700 15px "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';
  const w = g.measureText(text).width + 18;
  const h = 24;
  g.save();
  g.translate(x, y);
  g.rotate(-0.02);
  g.fillStyle = PAPER;
  g.strokeStyle = INK;
  g.lineWidth = 2;
  g.beginPath();
  g.roundRect(-w / 2, 0, w, h, 10);
  g.fill();
  g.stroke();
  g.fillStyle = accent;
  g.fillRect(-w / 2 + 6, h - 6, w - 12, 3);
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, h / 2 - 1);
  g.restore();
}

function drawCritter(g: CanvasRenderingContext2D, id: PlayerId, c: Critter): void {
  const player = ctx?.players.get(id);
  if (!player) return;
  const pose = poseOf(c);
  const sprite = sprites.get(`${c.species}|${c.body ?? ''}|${c.accent}|${pose}`, ANIMAL_SIZE, ANIMAL_SIZE, dpr, (sg, w) =>
    drawAnimal(sg, { species: c.species, pose, accent: c.accent, body: c.body, size: w }),
  );

  const hop = c.hopT >= 0 ? Math.sin(Math.PI * c.hopT) * HOP_HEIGHT : 0;
  const feetY = c.y + FEET;
  const alpha = player.connected ? 1 : 0.4;

  g.globalAlpha = alpha;
  shadow(g, c.x, feetY - 2, ANIMAL_SIZE * 0.3 * (1 - hop / (HOP_HEIGHT * 2.2)), 0.22);

  // squash & stretch: walking bob, idle breathing, landing squash
  let sx = 1;
  let sy = 1;
  if (c.walkT > 0) {
    const s = Math.abs(Math.sin(c.walkT));
    sy = 1 + s * 0.05;
    sx = 1 - s * 0.03;
  } else {
    sy = 1 + Math.sin(clock * 2.2 + c.x * 0.01) * 0.015;
  }
  if (c.hopT >= 0) {
    if (c.hopT < 0.15) {
      sy *= 0.9;
      sx *= 1.08;
    } else {
      sy *= 1.06;
      sx *= 0.96;
    }
  }
  if (c.dashT > 0) sx *= 1.06;

  g.save();
  g.translate(c.x, feetY - hop);
  g.scale(c.facing * sx, sy);
  if (c.dashT > 0) g.rotate(0.12);
  g.drawImage(sprite, -ANIMAL_SIZE / 2, -ANIMAL_SIZE * ANIMAL_FEET_Y, ANIMAL_SIZE, ANIMAL_SIZE);
  g.restore();

  if (!player.connected) {
    g.fillStyle = INK;
    g.font = '700 18px "Comic Sans MS", "Chalkboard SE", system-ui, sans-serif';
    g.textAlign = 'left';
    const bob = Math.sin(clock * 2) * 3;
    g.fillText('z', c.x + 22, c.y - ANIMAL_SIZE * 0.45 + bob);
    g.fillText('z', c.x + 32, c.y - ANIMAL_SIZE * 0.58 - bob);
  }

  sticker(g, `${player.name} · ${c.score}`, c.x, feetY + 4, c.accent);
  g.globalAlpha = 1;
}

function drawItem(g: CanvasRenderingContext2D, it: Item): void {
  const sprite = sprites.get(`item|${it.kind}|${it.seed}`, ITEM_SIZE, ITEM_SIZE, dpr, (sg, w) =>
    drawCollectible(sg, it.kind, w, it.seed * 7919),
  );
  const appear = Math.min(1, it.age / 0.3);
  const scale = appear < 1 ? 0.4 + 0.6 * (1 - (1 - appear) * (1 - appear)) + Math.sin(appear * Math.PI) * 0.12 : 1;
  const floaty = it.kind === 'bubble';
  const bob = Math.sin(clock * (floaty ? 2.2 : 1.6) + it.phase) * (floaty ? 5 : 1.5);
  const sway = floaty ? 0 : Math.sin(clock * 1.3 + it.phase) * 0.08;

  shadow(g, it.x, it.y + ITEM_SIZE * 0.45, ITEM_SIZE * (floaty ? 0.22 : 0.3), floaty ? 0.1 : 0.16);
  g.save();
  g.translate(it.x, it.y - (floaty ? 8 : 0) + bob);
  g.rotate(sway);
  g.scale(scale, scale);
  g.drawImage(sprite, -ITEM_SIZE / 2, -ITEM_SIZE / 2, ITEM_SIZE, ITEM_SIZE);
  g.restore();
}

function drawPuff(g: CanvasRenderingContext2D, p: Puff): void {
  const r = 4 + p.t * 10;
  g.globalAlpha = (1 - p.t) * 0.7;
  g.fillStyle = PAPER;
  g.strokeStyle = withAlpha(INK, 0.5);
  g.lineWidth = 1.5;
  g.beginPath();
  g.arc(p.x, p.y - p.t * 8, r, 0, Math.PI * 2);
  g.fill();
  g.stroke();
  g.globalAlpha = 1;
}

function frame(now: number): void {
  raf = requestAnimationFrame(frame);
  if (!ctx || !g2d) return;
  const dt = lastT ? Math.min(0.1, (now - lastT) / 1000) : 0;
  lastT = now;
  clock += dt;

  // Keep critters in sync with the roster (covers setRoster after a room reclaim,
  // which does not fire onPlayerJoin).
  for (const p of ctx.players.values()) if (!critters.has(p.id)) ensureCritter(p);
  for (const id of critters.keys()) if (!ctx.players.has(id)) critters.delete(id);

  update(dt);

  const g = g2d;
  if (background) g.drawImage(background, 0, 0, width, height);
  else g.clearRect(0, 0, width, height);

  for (const p of puffs) drawPuff(g, p);

  // depth sort by ground position so lower things overlap higher ones
  const drawables: { y: number; draw: () => void }[] = [];
  for (const it of items) drawables.push({ y: it.y + ITEM_SIZE * 0.45, draw: () => drawItem(g, it) });
  for (const [id, c] of critters) drawables.push({ y: c.y + FEET, draw: () => drawCritter(g, id, c) });
  drawables.sort((a, b) => a.y - b.y);
  for (const d of drawables) d.draw();

  for (const p of pops) drawPop(g, p.kind, p.x, p.y, ITEM_SIZE, p.t, p.seed);
}

export const MeadowGame: GameModule = {
  id: 'meadow',
  name: 'Meadow',

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
    clock = 0;
    spawnCd = 0;
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
    background = null;
    sprites.clear();
    critters.clear();
    items = [];
    pops = [];
    puffs = [];
  },

  onPlayerJoin(player: Player): void {
    greet(player);
  },

  onPlayerLeave(player: Player): void {
    critters.delete(player.id);
  },
};
