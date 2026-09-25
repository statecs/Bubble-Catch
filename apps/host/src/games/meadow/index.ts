/**
 * Meadow: hand-drawn visual showcase. Each player is a distinct animal walking
 * around a pastel meadow collecting bubbles, leaves, berries and flowers.
 * Stick = walk, A = hop, B = dash. All art comes from @party/world.
 *
 * Free play by default. Host controls (panel top-right + keys): G start a timed round
 * (most items wins), Esc pause/resume, R reset to free play, +/− test bots.
 */
import { PLAYER_COLORS, ZERO_INPUT, type Axis, type InputState, type Player, type PlayerId } from '@party/contract';
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
const ROUND_TIME = 60; // s
const RESULTS_TIME = 6; // s the winner banner shows before free play resumes
const BOT_RETARGET = 2.5; // s between a bot's wander targets when there's nothing to collect

/** What the game needs to know about a player: real (from the roster) or a test bot. */
interface Who {
  name: string;
  color: string;
  connected: boolean;
}

interface Bot {
  name: string;
  color: string;
  tx: number;
  ty: number;
  retargetAt: number;
  hopAt: number;
}

type Phase =
  | { kind: 'free' }
  | { kind: 'round'; endsAt: number }
  | { kind: 'results'; endsAt: number; text: string };

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
let phase: Phase = { kind: 'free' };
let paused = false;
const bots = new Map<PlayerId, Bot>();
let botSeq = 0;
let panel: HTMLElement | null = null;
let btnStart: HTMLButtonElement | null = null;
let btnPause: HTMLButtonElement | null = null;

function info(id: PlayerId): Who | undefined {
  const bot = bots.get(id);
  if (bot) return { name: bot.name, color: bot.color, connected: true };
  return ctx?.players.get(id);
}

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

function ensureCritter(player: { id: PlayerId; color: string }): Critter {
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
    const input = inputFor(id, c);
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
  const connected = [...ctx.players.values()].filter((p) => p.connected).length + bots.size;
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
      if (!info(id)?.connected) continue;
      if (Math.hypot(c.x - it.x, c.y - it.y) > COLLECT_DIST) continue;
      c.score += 1;
      c.happyT = HAPPY_TIME;
      pops.push({ kind: it.kind, x: it.x, y: it.y, t: 0, seed: Math.floor(Math.random() * 1e6) });
      if (!bots.has(id)) ctx!.sendToPlayer(id, { text: `${COLLECTIBLE_EMOJI[it.kind]} ${c.score}`, vibrate: 40 });
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
  const player = info(id);
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

  // Keep critters in sync with the roster (covers setRoster after a room reclaim,
  // which does not fire onPlayerJoin).
  for (const p of ctx.players.values()) if (!critters.has(p.id)) ensureCritter(p);
  for (const id of critters.keys()) if (!ctx.players.has(id) && !bots.has(id)) critters.delete(id);

  if (!paused) {
    clock += dt;
    update(dt);
    tickPhase();
  }
  updatePanel();

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
  drawHud(g);
}

// ---------- rounds ----------

function startRound(): void {
  if (critters.size === 0) return;
  paused = false;
  phase = { kind: 'round', endsAt: clock + ROUND_TIME };
  clearField();
  hintAll(`Go! Most items in ${ROUND_TIME} s wins`, 80);
}

function toFree(): void {
  paused = false;
  phase = { kind: 'free' };
  clearField();
  hintAll('Free play', 0);
}

/** Zero scores, respawn everyone, empty the meadow. */
function clearField(): void {
  const b = bounds();
  for (const c of critters.values()) {
    c.score = 0;
    c.x = b.minX + Math.random() * (b.maxX - b.minX);
    c.y = b.minY + Math.random() * (b.maxY - b.minY);
    c.hopT = -1;
    c.dashT = 0;
  }
  items = [];
  pops = [];
  puffs = [];
  spawnCd = 0;
}

function tickPhase(): void {
  if (phase.kind === 'round' && clock >= phase.endsAt) endRound();
  else if (phase.kind === 'results' && clock >= phase.endsAt) phase = { kind: 'free' };
}

function endRound(): void {
  const rows = [...critters.entries()]
    .map(([id, c]) => ({ id, name: info(id)?.name ?? '???', score: c.score }))
    .sort((a, b) => b.score - a.score);
  const top = rows[0]?.score ?? 0;
  const winners = rows.filter((r) => r.score === top);
  const text =
    top === 0
      ? 'Nobody collected anything!'
      : winners.length === 1
        ? `${winners[0]!.name} wins with ${top}!`
        : `Tie at ${top}: ${winners.map((w) => w.name).join(', ')}`;
  phase = { kind: 'results', endsAt: clock + RESULTS_TIME, text };
  rows.forEach((r, i) => {
    if (bots.has(r.id)) return;
    const won = r.score === top && top > 0;
    ctx?.sendToPlayer(r.id, { text: won ? `You win! ${r.score}` : `#${i + 1} · ${r.score}`, vibrate: won ? 200 : 60 });
  });
}

function hintAll(text: string, vibrate: number): void {
  ctx?.sendToAll(vibrate ? { text, vibrate } : { text });
}

function drawHud(g: CanvasRenderingContext2D): void {
  if (phase.kind === 'round') {
    const left = Math.max(0, Math.ceil(phase.endsAt - clock));
    sticker(g, `${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, '0')}`, width / 2, 14, '#facc15');
  }
  if (phase.kind === 'results') banner(g, phase.text);
  if (paused) banner(g, 'Paused');
}

function banner(g: CanvasRenderingContext2D, text: string): void {
  g.save();
  g.font = '700 34px "Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';
  const w = g.measureText(text).width + 48;
  const h = 64;
  g.translate(width / 2, height / 2);
  g.rotate(-0.02);
  g.fillStyle = PAPER;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(-w / 2, -h / 2, w, h, 16);
  g.fill();
  g.stroke();
  g.fillStyle = INK;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(text, 0, 1);
  g.restore();
}

// ---------- test bots ----------

function inputFor(id: PlayerId, c: Critter): InputState {
  const bot = bots.get(id);
  if (!bot) return info(id)?.connected ? (ctx?.inputs.get(id) ?? ZERO_INPUT) : ZERO_INPUT;
  const hop = clock >= bot.hopAt;
  if (hop) bot.hopAt = clock + 2 + Math.random() * 4;
  return { axis: botAxis(bot, c), buttons: { a: hop, b: false } };
}

/** Head for the nearest item; wander when the meadow is empty. */
function botAxis(bot: Bot, c: Critter): Axis {
  let best = Infinity;
  for (const it of items) {
    const d = (it.x - c.x) ** 2 + (it.y - c.y) ** 2;
    if (d < best) {
      best = d;
      bot.tx = it.x;
      bot.ty = it.y;
    }
  }
  if (best === Infinity && (clock >= bot.retargetAt || Math.hypot(bot.tx - c.x, bot.ty - c.y) < 20)) {
    const b = bounds();
    bot.tx = b.minX + Math.random() * (b.maxX - b.minX);
    bot.ty = b.minY + Math.random() * (b.maxY - b.minY);
    bot.retargetAt = clock + BOT_RETARGET;
  }
  const dist = Math.hypot(bot.tx - c.x, bot.ty - c.y);
  if (dist < 4) return { x: 0, y: 0 };
  const k = 0.7 / dist; // a bit slower than a full stick so humans can win
  return { x: (bot.tx - c.x) * k, y: (bot.ty - c.y) * k };
}

function addBot(): void {
  const n = ++botSeq;
  const id = `bot-${n.toString().padStart(4, '0')}`;
  const color = PLAYER_COLORS[(n + 5) % PLAYER_COLORS.length]!;
  bots.set(id, { name: `Bot ${n}`, color, tx: 0, ty: 0, retargetAt: 0, hopAt: clock + Math.random() * 3 });
  ensureCritter({ id, color });
}

function removeBot(): void {
  const last = [...bots.keys()].pop();
  if (!last) return;
  bots.delete(last);
  critters.delete(last);
}

// ---------- host controls ----------

function togglePause(): void {
  paused = !paused;
  hintAll(paused ? 'Paused' : 'Go!', paused ? 0 : 60);
}

function onKey(e: KeyboardEvent): void {
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
  switch (e.code) {
    case 'KeyG':
      startRound();
      break;
    case 'KeyR':
      toFree();
      break;
    case 'Escape':
      togglePause();
      break;
    case 'Equal':
    case 'NumpadAdd':
      addBot();
      break;
    case 'Minus':
    case 'NumpadSubtract':
      removeBot();
      break;
  }
}

function buildPanel(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:2;font:600 13px system-ui,sans-serif;';
  const mk = (label: string, title: string, onClick: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.title = title;
    b.style.cssText =
      'background:rgba(30,41,59,.9);color:#e2e8f0;border:1px solid rgba(148,163,184,.35);border-radius:8px;padding:6px 10px;cursor:pointer;';
    b.addEventListener('click', (ev) => {
      ev.preventDefault();
      onClick();
      b.blur();
    });
    el.appendChild(b);
    return b;
  };
  btnStart = mk('▶ Start', `Start a ${ROUND_TIME} s round (G)`, startRound);
  btnPause = mk('⏸ Pause', 'Pause / resume (Esc)', togglePause);
  mk('↺ Reset', 'Back to free play (R)', toFree);
  mk('+ Bot', 'Add a test bot (+)', addBot);
  mk('− Bot', 'Remove a test bot (−)', removeBot);
  return el;
}

function updatePanel(): void {
  if (btnStart) btnStart.disabled = phase.kind === 'round' || critters.size === 0;
  if (btnPause) btnPause.textContent = paused ? '▶ Resume' : '⏸ Pause';
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
    panel = buildPanel();
    c.container.appendChild(panel);
    window.addEventListener('keydown', onKey);
    lastT = 0;
    clock = 0;
    spawnCd = 0;
    phase = { kind: 'free' };
    paused = false;
    raf = requestAnimationFrame(frame);
  },

  unmount(): void {
    cancelAnimationFrame(raf);
    raf = 0;
    ro?.disconnect();
    ro = null;
    window.removeEventListener('keydown', onKey);
    panel?.remove();
    panel = btnStart = btnPause = null;
    bots.clear();
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
