/**
 * Tag / Infection.
 *
 * Phases: lobby (move freely, press A to ready) → countdown → play → results → lobby.
 * One random player starts infected ("IT"). Touching a survivor infects them.
 * Survivors win if anyone is left when time runs out. Powerups spawn on the floor.
 * B = dash (short burst, cooldown). Late joiners during a round spawn infected.
 *
 * Host controls (panel top-right + keys): G start now, Esc pause/resume, R reset, +/− test bots.
 * The game runs on its own clock (`this.clock`) which stops while paused.
 */
import { PLAYER_COLORS, ZERO_INPUT, type Axis, type Buttons, type Player, type PlayerId } from '@party/contract';
import type { GameContext, GameModule } from '../../game/GameModule';
import { CFG, INFECTED_COLOR, POWERUPS, type PowerupKind } from './config';
import { render } from './render';
import { newEnt, resetForLobby, type Ent, type EntInfo, type Phase, type Powerup, type RankRow } from './state';

const POWERUP_KINDS: PowerupKind[] = ['speed', 'shield', 'freeze'];
const JOIN_HINT = 'Stick = move · A = ready · B = dash';
const READY_HINT = 'Press A when ready · B = dash';

class Tag implements GameModule {
  readonly id = 'tag';
  readonly name = 'Tag / Infection';

  private ctx: GameContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private panel: HTMLElement | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private lastT = 0;
  private width = 0;
  private height = 0;

  /** Game time in ms. Advances only while not paused. */
  private clock = 0;
  private paused = false;
  private phase: Phase = { kind: 'lobby' };
  private ents = new Map<PlayerId, Ent>();
  private powerups: Powerup[] = [];
  private nextPowerupAt = 0;
  private prevButtons = new Map<PlayerId, Buttons>();
  private botSeq = 0;
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
    for (const p of ctx.players.values()) this.ensureEnt(p.id);
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
    this.ents.clear();
    this.powerups = [];
    this.prevButtons.clear();
    this.phase = { kind: 'lobby' };
    this.paused = false;
  }

  onPlayerJoin(player: Player): void {
    const e = this.ensureEnt(player.id);
    if (this.phase.kind === 'play' || this.phase.kind === 'countdown') {
      e.infected = true;
      e.graceUntil = this.clock + CFG.infectGraceMs;
      this.hint(e, 'Round in progress: you start infected. Tag!', 120, INFECTED_COLOR);
    } else {
      this.hint(e, JOIN_HINT, 80);
    }
  }

  onPlayerLeave(player: Player): void {
    this.ents.delete(player.id);
    this.prevButtons.delete(player.id);
  }

  onPlayerConnection(player: Player): void {
    const e = this.ents.get(player.id);
    if (e && !player.connected && this.phase.kind === 'lobby') e.ready = false;
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
    }

    render({
      g: this.g,
      width: this.width,
      height: this.height,
      now: this.clock,
      phase: this.phase,
      paused: this.paused,
      ents: this.ents,
      info: (id) => this.info(id),
      powerups: this.powerups,
    });
    this.updatePanel();
  }

  private info(id: PlayerId): EntInfo | undefined {
    const e = this.ents.get(id);
    if (e?.bot) return { name: e.bot.name, color: e.bot.color, connected: true };
    return this.ctx?.players.get(id);
  }

  private axisFor(e: Ent, now: number): Axis {
    if (e.bot) return this.botAxis(e, now);
    return (this.ctx?.inputs.get(e.id) ?? ZERO_INPUT).axis;
  }

  /** Button edge detection: A = ready toggle (lobby), B = dash. */
  private readButtons(now: number): void {
    if (!this.ctx) return;
    for (const e of this.ents.values()) {
      if (e.bot) continue;
      const cur = (this.ctx.inputs.get(e.id) ?? ZERO_INPUT).buttons;
      const prev = this.prevButtons.get(e.id) ?? ZERO_INPUT.buttons;
      if (cur.a && !prev.a && this.phase.kind === 'lobby') this.toggleReady(e);
      if (cur.b && !prev.b && (this.phase.kind === 'lobby' || this.phase.kind === 'play')) this.tryDash(e, now);
      this.prevButtons.set(e.id, { ...cur });
    }
  }

  private move(now: number, dt: number): void {
    if (!this.ctx) return;
    if (this.phase.kind !== 'lobby' && this.phase.kind !== 'play') return;
    const R = CFG.radius;
    for (const e of this.ents.values()) {
      if (e.frozenUntil > now) continue;
      const axis = this.axisFor(e, now);
      const mag = Math.hypot(axis.x, axis.y);
      if (mag > 0.2) {
        e.faceX = axis.x / mag;
        e.faceY = axis.y / mag;
        if (!e.hasMoved && !e.bot) {
          e.hasMoved = true;
          if (this.phase.kind === 'lobby') this.hint(e, 'Nice! ' + READY_HINT, 40);
        }
      }
      let speed = CFG.speed;
      if (e.bot) speed *= CFG.bot.speedMult;
      if (e.infected) speed *= CFG.infectedSpeedMult;
      if (e.speedUntil > now) speed *= CFG.powerup.speedMult;
      let vx = axis.x;
      let vy = axis.y;
      if (e.dashUntil > now) {
        speed *= CFG.dash.speedMult;
        vx = e.dashX;
        vy = e.dashY;
      }
      e.x = clamp(e.x + vx * speed * dt, R, Math.max(R, this.width - R));
      e.y = clamp(e.y + vy * speed * dt, R, Math.max(R, this.height - R));
    }
    if (this.phase.kind === 'play') {
      this.pickups(now);
      this.infections(now);
    }
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
      case 'play': {
        const survivors = [...this.ents.values()].filter((e) => !e.infected);
        if (now >= this.phase.endsAt || survivors.length === 0) this.endRound(now);
        else this.spawnPowerups(now);
        break;
      }
      case 'results':
        if (now >= this.phase.endsAt) this.toLobby();
        break;
    }
  }

  private connectedEnts(): Ent[] {
    return [...this.ents.values()].filter((e) => this.info(e.id)?.connected);
  }

  private allReady(): boolean {
    const c = this.connectedEnts();
    const humans = c.filter((e) => !e.bot);
    return c.length >= CFG.minPlayers && humans.length > 0 && humans.every((e) => e.ready);
  }

  private toggleReady(e: Ent): void {
    e.ready = !e.ready;
    this.hint(e, e.ready ? 'READY ✓  (A to cancel)' : READY_HINT, 40);
  }

  private startCountdown(now: number): void {
    if (this.phase.kind !== 'lobby' || this.ents.size === 0) return;
    const endsAt = now + CFG.countdownMs;
    this.phase = { kind: 'countdown', endsAt };
    this.powerups = [];
    for (const e of this.ents.values()) {
      resetForLobby(e);
      this.respawn(e);
      e.frozenUntil = endsAt;
    }
    this.hintAll('Get ready…', 60);
  }

  private startPlay(now: number): void {
    const candidates = this.connectedEnts();
    const pool = candidates.length ? candidates : [...this.ents.values()];
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (!it) return this.toLobby();
    it.infected = true;
    it.wasIt = true;
    it.graceUntil = now + CFG.infectGraceMs;
    const itName = this.info(it.id)?.name ?? '???';
    this.phase = { kind: 'play', startedAt: now, endsAt: now + CFG.roundMs, itName };
    this.nextPowerupAt = now + CFG.powerup.spawnEveryMs / 2;
    for (const e of this.ents.values()) {
      e.frozenUntil = 0;
      if (e.infected) this.hint(e, 'You are IT! Tag them all', 300, INFECTED_COLOR);
      else this.hint(e, `RUN! ${itName} is IT`, 150);
    }
  }

  private endRound(now: number): void {
    if (this.phase.kind !== 'play') return;
    const { startedAt } = this.phase;
    const rows: RankRow[] = [];
    for (const e of this.ents.values()) {
      const p = this.info(e.id);
      if (!p) continue;
      if (!e.infected) e.survivedMs = now - startedAt;
      rows.push({ id: e.id, name: p.name, color: p.color, survivedMs: e.survivedMs, survived: !e.infected, wasIt: e.wasIt });
    }
    rows.sort((a, b) => {
      if (a.wasIt !== b.wasIt) return a.wasIt ? 1 : -1;
      if (a.survived !== b.survived) return a.survived ? -1 : 1;
      return b.survivedMs - a.survivedMs;
    });
    const survivorsWon = rows.some((r) => r.survived);
    const endsAt = now + CFG.resultsMs;
    this.phase = { kind: 'results', endsAt, ranking: rows, survivorsWon };
    this.powerups = [];
    rows.forEach((r, i) => {
      const e = this.ents.get(r.id);
      if (!e) return;
      e.frozenUntil = endsAt;
      this.hint(e, r.survived ? `You survived! #${i + 1}` : r.wasIt ? `You were IT · #${i + 1}` : `Infected · #${i + 1}`, 100, r.color);
    });
  }

  private toLobby(): void {
    this.phase = { kind: 'lobby' };
    this.powerups = [];
    for (const e of this.ents.values()) {
      resetForLobby(e);
      this.respawn(e);
      this.hint(e, READY_HINT, 0, this.info(e.id)?.color);
    }
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
    const id = `bot-${n.toString().padStart(4, '0')}`;
    const e = this.ensureEnt(id);
    e.bot = { name: `Bot ${n}`, color: PLAYER_COLORS[(n + 5) % PLAYER_COLORS.length]!, tx: e.x, ty: e.y, retargetAt: 0 };
    e.ready = true;
    e.hasMoved = true;
    if (this.phase.kind === 'play' || this.phase.kind === 'countdown') e.infected = true;
  }

  private removeBot(): void {
    const bots = [...this.ents.values()].filter((e) => e.bot);
    const last = bots[bots.length - 1];
    if (last) this.ents.delete(last.id);
  }

  private botAxis(e: Ent, now: number): Axis {
    const b = e.bot!;
    const others = [...this.ents.values()].filter((o) => o !== e);
    if (this.phase.kind === 'play') {
      const enemies = others.filter((o) => o.infected !== e.infected);
      let nearest: Ent | undefined;
      let best = Infinity;
      for (const o of enemies) {
        const d = (o.x - e.x) ** 2 + (o.y - e.y) ** 2;
        if (d < best) {
          best = d;
          nearest = o;
        }
      }
      if (nearest) {
        const dist = Math.sqrt(best) || 1;
        const dx = (nearest.x - e.x) / dist;
        const dy = (nearest.y - e.y) / dist;
        if (e.infected) return { x: dx, y: dy };
        if (dist < CFG.bot.fleeDistance) return { x: -dx, y: -dy };
      }
    }
    if (now >= b.retargetAt || Math.hypot(b.tx - e.x, b.ty - e.y) < 20) {
      b.tx = 40 + Math.random() * Math.max(1, this.width - 80);
      b.ty = 40 + Math.random() * Math.max(1, this.height - 80);
      b.retargetAt = now + CFG.bot.retargetMs + Math.random() * 1000;
    }
    const dist = Math.hypot(b.tx - e.x, b.ty - e.y) || 1;
    return { x: (b.tx - e.x) / dist, y: (b.ty - e.y) / dist };
  }

  private buildPanel(): HTMLElement {
    const panel = document.createElement('div');
    panel.style.cssText =
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
      panel.appendChild(b);
      return b;
    };
    this.btnStart = mk('▶ Start', 'Start the round now (G)', () => this.startCountdown(this.clock));
    this.btnPause = mk('⏸ Pause', 'Pause / resume (Esc)', () => this.togglePause());
    mk('↺ Reset', 'Back to lobby (R)', () => {
      this.paused = false;
      this.toLobby();
    });
    mk('+ Bot', 'Add a test bot (+)', () => this.addBot());
    mk('− Bot', 'Remove a test bot (−)', () => this.removeBot());
    return panel;
  }
  private btnStart: HTMLButtonElement | null = null;
  private btnPause: HTMLButtonElement | null = null;

  private updatePanel(): void {
    if (this.btnStart) this.btnStart.disabled = this.phase.kind !== 'lobby' || this.ents.size === 0;
    if (this.btnPause) this.btnPause.textContent = this.paused ? '▶ Resume' : '⏸ Pause';
  }

  // ---------- mechanics ----------

  private tryDash(e: Ent, now: number): void {
    if (e.dashCooldownUntil > now || e.frozenUntil > now) return;
    e.dashX = e.faceX;
    e.dashY = e.faceY;
    e.dashUntil = now + CFG.dash.durationMs;
    e.dashCooldownUntil = now + CFG.dash.cooldownMs;
    this.hint(e, undefined, 30);
  }

  private infections(now: number): void {
    const R2 = (CFG.radius * 2) ** 2;
    const infected = [...this.ents.values()].filter((e) => e.infected && e.graceUntil <= now && e.frozenUntil <= now);
    const survivors = [...this.ents.values()].filter((e) => !e.infected && e.immuneUntil <= now);
    for (const s of survivors) {
      for (const i of infected) {
        if ((s.x - i.x) ** 2 + (s.y - i.y) ** 2 > R2) continue;
        if (s.shield) {
          s.shield = false;
          s.immuneUntil = now + CFG.shieldEscapeMs;
          this.hint(s, 'Shield saved you! RUN', 120);
        } else {
          this.infect(s, now);
        }
        break;
      }
    }
  }

  private infect(s: Ent, now: number): void {
    if (this.phase.kind !== 'play') return;
    s.infected = true;
    s.graceUntil = now + CFG.infectGraceMs;
    s.survivedMs = now - this.phase.startedAt;
    s.speedUntil = 0;
    this.hint(s, 'INFECTED! Tag the others', 250, INFECTED_COLOR);
  }

  private spawnPowerups(now: number): void {
    if (now < this.nextPowerupAt || this.powerups.length >= CFG.powerup.max) return;
    this.nextPowerupAt = now + CFG.powerup.spawnEveryMs;
    const pad = 40;
    const minD2 = CFG.powerup.minPlayerDistance ** 2;
    for (let tries = 0; tries < 12; tries++) {
      const x = pad + Math.random() * Math.max(1, this.width - pad * 2);
      const y = pad + Math.random() * Math.max(1, this.height - pad * 2);
      const tooClose = [...this.ents.values()].some((e) => (e.x - x) ** 2 + (e.y - y) ** 2 < minD2);
      if (tooClose) continue;
      const kind = POWERUP_KINDS[Math.floor(Math.random() * POWERUP_KINDS.length)]!;
      this.powerups.push({ kind, x, y, spawnedAt: now });
      return;
    }
  }

  private pickups(now: number): void {
    if (!this.powerups.length) return;
    const reach2 = (CFG.radius + CFG.powerup.radius) ** 2;
    this.powerups = this.powerups.filter((p) => {
      for (const e of this.ents.values()) {
        if (e.frozenUntil > now) continue;
        if ((e.x - p.x) ** 2 + (e.y - p.y) ** 2 > reach2) continue;
        this.applyPowerup(e, p.kind, now);
        return false;
      }
      return true;
    });
  }

  private applyPowerup(e: Ent, kind: PowerupKind, now: number): void {
    switch (kind) {
      case 'speed':
        e.speedUntil = now + CFG.powerup.speedMs;
        break;
      case 'shield':
        if (e.infected) e.speedUntil = now + CFG.powerup.speedMs;
        else e.shield = true;
        break;
      case 'freeze':
        for (const o of this.ents.values()) if (o.infected !== e.infected) o.frozenUntil = now + CFG.powerup.freezeMs;
        break;
    }
    this.hint(e, POWERUPS[kind].label, 60);
  }

  // ---------- helpers ----------

  private ensureEnt(id: PlayerId): Ent {
    let e = this.ents.get(id);
    if (!e) {
      e = newEnt(id, 0, 0);
      this.respawn(e);
      this.ents.set(id, e);
    }
    return e;
  }

  private respawn(e: Ent): void {
    const R = CFG.radius;
    e.x = R + Math.random() * Math.max(1, this.width - 2 * R);
    e.y = R + Math.random() * Math.max(1, this.height - 2 * R);
  }

  private hint(e: Ent, text?: string, vibrate = 0, color?: string): void {
    if (e.bot) return;
    const ui: { text?: string; vibrate?: number; color?: string } = {};
    if (text !== undefined) ui.text = text.slice(0, 40);
    if (vibrate) ui.vibrate = vibrate;
    if (color) ui.color = color;
    if (Object.keys(ui).length) this.ctx?.sendToPlayer(e.id, ui);
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
  }
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

export const TagGame: GameModule = new Tag();
