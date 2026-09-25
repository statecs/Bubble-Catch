/**
 * Paint to Conquer.
 *
 * Everyone is a goo blob that leaves paint wherever it goes. Paint over other colours to steal
 * the floor. Most floor at the end wins. A = splat (paint burst), B = dash (fast, wide trail).
 * Paint bombs spawn on the floor: run into one for a huge splat.
 *
 * Phases: lobby (A to ready) → countdown → play → results → lobby. Same host panel as Tag.
 */
import { PLAYER_COLORS, ZERO_INPUT, type Axis, type Buttons, type Player, type PlayerId } from '@party/contract';
import type { GameContext, GameModule } from '../../game/GameModule';
import { CFG } from './config';
import { PaintLayer } from './paint';
import { render } from './render';
import { newGoo, resetForLobby, type Bomb, type Drip, type Goo, type GooInfo, type Phase, type Score, type SplatFx } from './state';

const JOIN_HINT = 'Stick = move & paint · A = ready · B = dash';
const READY_HINT = 'Press A when ready · B = dash';

class Paint implements GameModule {
  readonly id = 'paint';
  readonly name = 'Paint to Conquer';

  private ctx: GameContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private panel: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private lastT = 0;
  private width = 0;
  private height = 0;

  private clock = 0;
  private paused = false;
  private phase: Phase = { kind: 'lobby' };
  private goos = new Map<PlayerId, Goo>();
  private paint = new PaintLayer();
  private bombs: Bomb[] = [];
  private splats: SplatFx[] = [];
  private drips: Drip[] = [];
  private scores: Score[] = [];
  private nextBombAt = 0;
  private nextCoverageAt = 0;
  private prevButtons = new Map<PlayerId, Buttons>();
  private botSeq = 0;
  private btnStart: HTMLButtonElement | null = null;
  private btnPause: HTMLButtonElement | null = null;
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  // ---------- lifecycle ----------

  mount(ctx: GameContext): void {
    this.ctx = ctx;
    ctx.container.style.position = 'relative';
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    ctx.container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
    this.panel = this.buildPanel();
    ctx.container.appendChild(this.panel);
    this.ro = new ResizeObserver(() => this.resize());
    this.ro.observe(ctx.container);
    this.resize();
    for (const p of ctx.players.values()) this.ensureGoo(p.id);
    window.addEventListener('keydown', this.onKey);
    this.lastT = 0;
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  unmount(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener('keydown', this.onKey);
    this.ro?.disconnect();
    this.canvas?.remove();
    this.panel?.remove();
    if (this.ctx) this.ctx.container.style.position = '';
    this.ro = this.canvas = this.g = this.panel = this.ctx = null;
    this.goos.clear();
    this.prevButtons.clear();
    this.bombs = [];
    this.splats = [];
    this.drips = [];
    this.scores = [];
    this.paint = new PaintLayer();
    this.phase = { kind: 'lobby' };
    this.paused = false;
  }

  onPlayerJoin(player: Player): void {
    const goo = this.ensureGoo(player.id);
    this.hint(goo, this.phase.kind === 'play' ? 'Round in progress: paint!' : JOIN_HINT, 80, player.color);
  }

  onPlayerLeave(player: Player): void {
    this.goos.delete(player.id);
    this.prevButtons.delete(player.id);
  }

  onPlayerConnection(player: Player): void {
    const goo = this.goos.get(player.id);
    if (goo && !player.connected && this.phase.kind === 'lobby') goo.ready = false;
  }

  // ---------- loop ----------

  private frame(wall: number): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!this.ctx || !this.g) return;
    const dt = this.lastT ? Math.min(0.1, (wall - this.lastT) / 1000) : 0;
    this.lastT = wall;

    if (!this.paused) {
      this.clock += dt * 1000;
      const now = this.clock;
      this.readButtons(now);
      this.move(now, dt);
      this.tickPhase(now);
      this.splats = this.splats.filter((s) => now - s.start < 320);
      this.drips = this.drips.filter((d) => now - d.start < 600);
      for (const goo of this.goos.values()) goo.squish = Math.max(0, goo.squish - dt * 4);
    }

    render({
      g: this.g,
      width: this.width,
      height: this.height,
      now: this.clock,
      phase: this.phase,
      paused: this.paused,
      goos: this.goos,
      info: (id) => this.info(id),
      paint: this.paint,
      bombs: this.bombs,
      splats: this.splats,
      drips: this.drips,
      scores: this.scores,
    });
    this.updatePanel();
  }

  private info(id: PlayerId): GooInfo | undefined {
    const goo = this.goos.get(id);
    if (goo?.bot) return { name: goo.bot.name, color: goo.bot.color, connected: true };
    return this.ctx?.players.get(id);
  }

  private axisFor(goo: Goo, now: number): Axis {
    if (goo.bot) return this.botAxis(goo, now);
    return (this.ctx?.inputs.get(goo.id) ?? ZERO_INPUT).axis;
  }

  private readButtons(now: number): void {
    if (!this.ctx) return;
    for (const goo of this.goos.values()) {
      if (goo.bot) continue;
      const cur = (this.ctx.inputs.get(goo.id) ?? ZERO_INPUT).buttons;
      const prev = this.prevButtons.get(goo.id) ?? ZERO_INPUT.buttons;
      if (cur.a && !prev.a) {
        if (this.phase.kind === 'lobby') this.toggleReady(goo);
        else if (this.phase.kind === 'play') this.trySplat(goo, now);
      }
      if (cur.b && !prev.b && (this.phase.kind === 'lobby' || this.phase.kind === 'play')) this.tryDash(goo, now);
      this.prevButtons.set(goo.id, { ...cur });
    }
  }

  private move(now: number, dt: number): void {
    if (!this.ctx) return;
    const playing = this.phase.kind === 'play';
    if (!playing && this.phase.kind !== 'lobby') {
      for (const goo of this.goos.values()) goo.vx = goo.vy = 0;
      return;
    }
    const R = CFG.radius;
    for (const goo of this.goos.values()) {
      const axis = this.axisFor(goo, now);
      const mag = Math.hypot(axis.x, axis.y);
      if (mag > 0.2) {
        goo.faceX = axis.x / mag;
        goo.faceY = axis.y / mag;
        if (!goo.hasMoved && !goo.bot) {
          goo.hasMoved = true;
          if (this.phase.kind === 'lobby') this.hint(goo, 'Nice! ' + READY_HINT, 40);
        }
      }
      let speed = CFG.speed;
      if (goo.bot) speed *= CFG.bot.speedMult;
      let vx = axis.x;
      let vy = axis.y;
      const dashing = goo.dashUntil > now;
      if (dashing) {
        speed *= CFG.dash.speedMult;
        vx = goo.dashX;
        vy = goo.dashY;
      }
      const nx = clamp(goo.x + vx * speed * dt, R, Math.max(R, this.width - R));
      const ny = clamp(goo.y + vy * speed * dt, R, Math.max(R, this.height - R));
      goo.vx = (nx - goo.x) / Math.max(dt, 1e-3);
      goo.vy = (ny - goo.y) / Math.max(dt, 1e-3);
      const travelled = Math.hypot(nx - goo.x, ny - goo.y);
      goo.x = nx;
      goo.y = ny;

      if (playing && travelled > 0) {
        goo.sinceStamp += travelled;
        const info = this.info(goo.id);
        while (goo.sinceStamp >= CFG.brush.stepPx && info) {
          goo.sinceStamp -= CFG.brush.stepPx;
          const r = CFG.brush.radius * (dashing ? CFG.dash.brushMult : 1) * (0.9 + Math.random() * 0.2);
          this.paint.stamp(goo.x + (Math.random() - 0.5) * 6, goo.y + (Math.random() - 0.5) * 6 + 6, r, info.color, goo.owner, dashing ? 0.6 : 0.35);
          if (Math.random() < CFG.dripChance) this.spawnDrip(goo, info.color, now);
        }
      }
    }
    if (playing) this.pickups(now);
  }

  // ---------- phases ----------

  private tickPhase(now: number): void {
    switch (this.phase.kind) {
      case 'lobby':
        if (this.allReady()) this.startCountdown(now);
        break;
      case 'countdown':
        if (now >= this.phase.endsAt) this.startPlay(now);
        break;
      case 'play':
        if (now >= this.phase.endsAt) this.endRound(now);
        else {
          this.spawnBombs(now);
          if (now >= this.nextCoverageAt) {
            this.nextCoverageAt = now + CFG.coverageEveryMs;
            this.scores = this.computeScores();
          }
        }
        break;
      case 'results':
        if (now >= this.phase.endsAt) this.toLobby();
        break;
    }
  }

  private connectedGoos(): Goo[] {
    return [...this.goos.values()].filter((goo) => this.info(goo.id)?.connected);
  }

  private allReady(): boolean {
    const c = this.connectedGoos();
    const humans = c.filter((goo) => !goo.bot);
    return c.length >= CFG.minPlayers && humans.length > 0 && humans.every((goo) => goo.ready);
  }

  private toggleReady(goo: Goo): void {
    goo.ready = !goo.ready;
    goo.squish = 0.6;
    this.hint(goo, goo.ready ? 'READY ✓  (A to cancel)' : READY_HINT, 40);
  }

  private startCountdown(now: number): void {
    if (this.phase.kind !== 'lobby' || this.goos.size === 0) return;
    this.phase = { kind: 'countdown', endsAt: now + CFG.countdownMs };
    this.paint.clear();
    this.bombs = [];
    this.scores = [];
    for (const goo of this.goos.values()) {
      resetForLobby(goo);
      this.respawn(goo);
    }
    this.hintAll('Get ready to paint…', 60);
  }

  private startPlay(now: number): void {
    this.phase = { kind: 'play', startedAt: now, endsAt: now + CFG.roundMs };
    this.nextBombAt = now + CFG.bomb.spawnEveryMs / 2;
    this.nextCoverageAt = now;
    for (const goo of this.goos.values()) this.hint(goo, 'PAINT! A = splat · B = dash', 150);
  }

  private endRound(now: number): void {
    if (this.phase.kind !== 'play') return;
    const scores = this.computeScores();
    this.phase = { kind: 'results', endsAt: now + CFG.resultsMs, startedAt: now, scores };
    this.scores = scores;
    this.bombs = [];
    scores.forEach((s, i) => {
      const goo = this.goos.get(s.id);
      if (!goo) return;
      goo.vx = goo.vy = 0;
      this.hint(goo, i === 0 ? `You conquered ${Math.round(s.share * 100)}%! #1` : `${Math.round(s.share * 100)}% · #${i + 1}`, 100, s.color);
    });
  }

  private toLobby(): void {
    this.phase = { kind: 'lobby' };
    this.paint.clear();
    this.bombs = [];
    this.scores = [];
    for (const goo of this.goos.values()) {
      resetForLobby(goo);
      this.respawn(goo);
      this.hint(goo, READY_HINT, 0, this.info(goo.id)?.color);
    }
  }

  private computeScores(): Score[] {
    const cov = this.paint.coverage();
    const out: Score[] = [];
    for (const goo of this.goos.values()) {
      const info = this.info(goo.id);
      if (!info) continue;
      out.push({ id: goo.id, name: info.name, color: info.color, share: cov.get(goo.owner) ?? 0 });
    }
    return out.sort((a, b) => b.share - a.share);
  }

  // ---------- mechanics ----------

  private trySplat(goo: Goo, now: number): void {
    if (goo.splatCooldownUntil > now) return;
    goo.splatCooldownUntil = now + CFG.splat.cooldownMs;
    const info = this.info(goo.id);
    if (!info) return;
    this.splatAt(goo.x, goo.y, CFG.splat.radius, CFG.splat.blobs, info.color, goo.owner, now);
    goo.squish = 1;
    this.hint(goo, undefined, 60);
  }

  private splatAt(x: number, y: number, radius: number, blobs: number, color: string, owner: number, now: number): void {
    this.paint.stamp(x, y, radius * 0.55, color, owner, 0.5);
    for (let i = 0; i < blobs; i++) {
      const a = Math.random() * Math.PI * 2;
      const d = radius * (0.35 + Math.random() * 0.65);
      const r = radius * (0.12 + Math.random() * 0.22);
      this.paint.stamp(x + Math.cos(a) * d, y + Math.sin(a) * d, r, color, owner, 0.5);
    }
    this.splats.push({ x, y, color, start: now, radius });
  }

  private tryDash(goo: Goo, now: number): void {
    if (goo.dashCooldownUntil > now) return;
    goo.dashX = goo.faceX;
    goo.dashY = goo.faceY;
    goo.dashUntil = now + CFG.dash.durationMs;
    goo.dashCooldownUntil = now + CFG.dash.cooldownMs;
    goo.squish = 0.5;
    this.hint(goo, undefined, 30);
  }

  private spawnDrip(goo: Goo, color: string, now: number): void {
    const width = 3 + Math.random() * 3;
    const length = 14 + Math.random() * 26;
    const x = goo.x + (Math.random() - 0.5) * CFG.brush.radius;
    const y = goo.y + CFG.brush.radius * 0.5;
    this.drips.push({ x, y, color, owner: goo.owner, start: now, length, width });
    this.paint.drip(x, y, length, width, color, goo.owner);
  }

  private spawnBombs(now: number): void {
    if (now < this.nextBombAt || this.bombs.length >= CFG.bomb.max) return;
    this.nextBombAt = now + CFG.bomb.spawnEveryMs;
    const pad = 50;
    const minD2 = CFG.bomb.minPlayerDistance ** 2;
    for (let tries = 0; tries < 12; tries++) {
      const x = pad + Math.random() * Math.max(1, this.width - pad * 2);
      const y = pad + Math.random() * Math.max(1, this.height - pad * 2);
      if ([...this.goos.values()].some((goo) => (goo.x - x) ** 2 + (goo.y - y) ** 2 < minD2)) continue;
      this.bombs.push({ x, y, spawnedAt: now });
      return;
    }
  }

  private pickups(now: number): void {
    if (!this.bombs.length) return;
    const reach2 = (CFG.radius + CFG.bomb.radius) ** 2;
    this.bombs = this.bombs.filter((b) => {
      for (const goo of this.goos.values()) {
        if ((goo.x - b.x) ** 2 + (goo.y - b.y) ** 2 > reach2) continue;
        const info = this.info(goo.id);
        if (info) {
          this.splatAt(b.x, b.y, CFG.bomb.splatRadius, 22, info.color, goo.owner, now);
          goo.squish = 1;
          this.hint(goo, 'KABLAM! Paint bomb', 200);
        }
        return false;
      }
      return true;
    });
  }

  // ---------- host controls ----------

  private handleKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.tagName === 'BUTTON')) return;
    switch (e.code) {
      case 'KeyG':
        this.startCountdown(this.clock);
        break;
      case 'KeyR':
        this.paused = false;
        this.toLobby();
        break;
      case 'Escape':
        this.togglePause();
        break;
      case 'Equal':
      case 'NumpadAdd':
        this.addBot();
        break;
      case 'Minus':
      case 'NumpadSubtract':
        this.removeBot();
        break;
    }
  }

  private togglePause(): void {
    this.paused = !this.paused;
    this.hintAll(this.paused ? 'Paused' : 'Go!', this.paused ? 0 : 60);
  }

  private addBot(): void {
    const n = ++this.botSeq;
    const goo = this.ensureGoo(`bot-${n.toString().padStart(4, '0')}`);
    goo.bot = { name: `Goo ${n}`, color: PLAYER_COLORS[(n + 5) % PLAYER_COLORS.length]!, tx: goo.x, ty: goo.y, retargetAt: 0 };
    goo.ready = true;
    goo.hasMoved = true;
  }

  private removeBot(): void {
    const bots = [...this.goos.values()].filter((goo) => goo.bot);
    const last = bots[bots.length - 1];
    if (last) this.goos.delete(last.id);
  }

  /** Bots head for floor they don't own yet; occasionally dash. */
  private botAxis(goo: Goo, now: number): Axis {
    const b = goo.bot!;
    if (now >= b.retargetAt || Math.hypot(b.tx - goo.x, b.ty - goo.y) < 24) {
      let best: { x: number; y: number } | null = null;
      for (let i = 0; i < 6; i++) {
        const x = 40 + Math.random() * Math.max(1, this.width - 80);
        const y = 40 + Math.random() * Math.max(1, this.height - 80);
        best = best ?? { x, y };
        if (this.paint.ownerAt(x, y) !== goo.owner) {
          best = { x, y };
          break;
        }
      }
      b.tx = best!.x;
      b.ty = best!.y;
      b.retargetAt = now + CFG.bot.retargetMs + Math.random() * 800;
      if (this.phase.kind === 'play' && Math.random() < 0.25) this.tryDash(goo, now);
    }
    const dist = Math.hypot(b.tx - goo.x, b.ty - goo.y) || 1;
    return { x: (b.tx - goo.x) / dist, y: (b.ty - goo.y) / dist };
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText = 'position:absolute;top:10px;right:10px;display:flex;gap:6px;z-index:2;font:600 13px system-ui,sans-serif;';
    const mk = (label: string, title: string, onClick: () => void) => {
      const b = document.createElement('button');
      b.textContent = label;
      b.title = title;
      b.style.cssText = 'background:rgba(38,35,30,.92);color:#fff4d6;border:2px solid #0e0d0b;border-radius:12px;padding:6px 10px;cursor:pointer;';
      b.addEventListener('click', (ev) => {
        ev.preventDefault();
        onClick();
        b.blur();
      });
      panel.appendChild(b);
      return b;
    };
    this.btnStart = mk('▶ Start', 'Start the round now (G)', () => this.startCountdown(this.clock));
    this.btnPause = mk('⏸ Pause', 'Pause / resume (Esc)', () => this.togglePause());
    mk('↺ Reset', 'Back to lobby (R)', () => {
      this.paused = false;
      this.toLobby();
    });
    mk('+ Goo', 'Add a test bot (+)', () => this.addBot());
    mk('− Goo', 'Remove a test bot (−)', () => this.removeBot());
    return panel;
  }

  private updatePanel(): void {
    if (this.btnStart) this.btnStart.disabled = this.phase.kind !== 'lobby' || this.goos.size === 0;
    if (this.btnPause) this.btnPause.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
  }

  // ---------- helpers ----------

  private ensureGoo(id: PlayerId): Goo {
    let goo = this.goos.get(id);
    if (!goo) {
      goo = newGoo(id, 0, 0);
      this.respawn(goo);
      this.goos.set(id, goo);
    }
    return goo;
  }

  private respawn(goo: Goo): void {
    const R = CFG.radius * 2;
    goo.x = R + Math.random() * Math.max(1, this.width - 2 * R);
    goo.y = R + Math.random() * Math.max(1, this.height - 2 * R);
    goo.sinceStamp = 0;
  }

  private hint(goo: Goo, text?: string, vibrate = 0, color?: string): void {
    if (goo.bot) return;
    const ui: { text?: string; vibrate?: number; color?: string } = {};
    if (text !== undefined) ui.text = text.slice(0, 40);
    if (vibrate) ui.vibrate = vibrate;
    if (color) ui.color = color;
    if (Object.keys(ui).length) this.ctx?.sendToPlayer(goo.id, ui);
  }

  private hintAll(text: string, vibrate = 0): void {
    this.ctx?.sendToAll(vibrate ? { text, vibrate } : { text });
  }

  private resize(): void {
    if (!this.ctx || !this.canvas || !this.g) return;
    const rect = this.ctx.container.getBoundingClientRect();
    this.width = rect.width;
    this.height = rect.height;
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.max(1, Math.round(this.width * dpr));
    this.canvas.height = Math.max(1, Math.round(this.height * dpr));
    this.canvas.style.width = `${this.width}px`;
    this.canvas.style.height = `${this.height}px`;
    this.g.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.paint.resize(this.width, this.height);
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const PaintGame: GameModule = new Paint();
