/**
 * Tag / Infection.
 *
 * Phases: lobby (move freely, press A to ready) → countdown → play → results → lobby.
 * One random player starts infected ("IT"). Touching a survivor infects them.
 * Survivors win if anyone is left when time runs out. Powerups spawn on the floor.
 * B = dash (short burst, cooldown). Late joiners during a round spawn infected.
 *
 * Host keyboard: G = start now (lobby), R = reset to lobby.
 */
import { ZERO_INPUT, type Buttons, type Player, type PlayerId } from '@party/contract';
import type { GameContext, GameModule } from '../../game/GameModule';
import { CFG, INFECTED_COLOR, POWERUPS, type PowerupKind } from './config';
import { render } from './render';
import { newEnt, resetForLobby, type Ent, type Phase, type Powerup, type RankRow } from './state';

const POWERUP_KINDS: PowerupKind[] = ['speed', 'shield', 'freeze'];

class Tag implements GameModule {
  readonly id = 'tag';
  readonly name = 'Tag / Infection';

  private ctx: GameContext | null = null;
  private canvas: HTMLCanvasElement | null = null;
  private g: CanvasRenderingContext2D | null = null;
  private ro: ResizeObserver | null = null;
  private raf = 0;
  private lastT = 0;
  private width = 0;
  private height = 0;

  private phase: Phase = { kind: 'lobby' };
  private ents = new Map<PlayerId, Ent>();
  private powerups: Powerup[] = [];
  private nextPowerupAt = 0;
  private prevButtons = new Map<PlayerId, Buttons>();
  private readonly onKey = (e: KeyboardEvent) => this.handleKey(e);

  // ---------- lifecycle ----------

  mount(ctx: GameContext): void {
    this.ctx = ctx;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    ctx.container.appendChild(this.canvas);
    this.g = this.canvas.getContext('2d');
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
    this.ro = this.canvas = this.g = this.ctx = null;
    this.ents.clear();
    this.powerups = [];
    this.prevButtons.clear();
    this.phase = { kind: 'lobby' };
  }

  onPlayerJoin(player: Player): void {
    const e = this.ensureEnt(player.id);
    if (this.phase.kind === 'play' || this.phase.kind === 'countdown') {
      // Joining mid-round: you're on the infected team, no free win.
      e.infected = true;
      e.graceUntil = performance.now() + CFG.infectGraceMs;
      this.hint(player.id, 'Round in progress: you start infected. Tag them!', 120, INFECTED_COLOR);
    } else {
      this.hint(player.id, 'Press A when ready · B = dash', 80);
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

  private frame(now: number): void {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    if (!this.ctx || !this.g) return;
    const dt = this.lastT ? Math.min(0.1, (now - this.lastT) / 1000) : 0;
    this.lastT = now;

    this.readButtons(now);
    this.move(now, dt);
    this.tickPhase(now);

    render({
      g: this.g,
      width: this.width,
      height: this.height,
      now,
      phase: this.phase,
      ents: this.ents,
      players: this.ctx.players,
      powerups: this.powerups,
    });
  }

  /** Button edge detection: A = ready toggle (lobby), B = dash. */
  private readButtons(now: number): void {
    if (!this.ctx) return;
    for (const e of this.ents.values()) {
      const cur = (this.ctx.inputs.get(e.id) ?? ZERO_INPUT).buttons;
      const prev = this.prevButtons.get(e.id) ?? ZERO_INPUT.buttons;
      if (cur.a && !prev.a && this.phase.kind === 'lobby') this.toggleReady(e);
      if (cur.b && !prev.b && (this.phase.kind === 'lobby' || this.phase.kind === 'play')) this.tryDash(e, now);
      this.prevButtons.set(e.id, { ...cur });
    }
  }

  private move(now: number, dt: number): void {
    if (!this.ctx) return;
    const canMove = this.phase.kind === 'lobby' || this.phase.kind === 'play';
    if (!canMove) return;
    const R = CFG.radius;
    for (const e of this.ents.values()) {
      if (e.frozenUntil > now) continue;
      const axis = (this.ctx.inputs.get(e.id) ?? ZERO_INPUT).axis;
      const mag = Math.hypot(axis.x, axis.y);
      if (mag > 0.2) {
        e.faceX = axis.x / mag;
        e.faceY = axis.y / mag;
      }
      let speed = CFG.speed;
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
    if (!this.ctx) return [];
    return [...this.ents.values()].filter((e) => this.ctx!.players.get(e.id)?.connected);
  }

  private allReady(): boolean {
    const c = this.connectedEnts();
    return c.length >= CFG.minPlayers && c.every((e) => e.ready);
  }

  private toggleReady(e: Ent): void {
    e.ready = !e.ready;
    this.hint(e.id, e.ready ? 'READY ✓  (A to cancel)' : 'Press A when ready · B = dash', 40);
  }

  private startCountdown(now: number): void {
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
    if (!this.ctx) return;
    const candidates = this.connectedEnts();
    const pool = candidates.length ? candidates : [...this.ents.values()];
    const it = pool[Math.floor(Math.random() * pool.length)];
    if (!it) return this.toLobby();
    it.infected = true;
    it.wasIt = true;
    it.graceUntil = now + CFG.infectGraceMs;
    const itName = this.ctx.players.get(it.id)?.name ?? '???';
    this.phase = { kind: 'play', startedAt: now, endsAt: now + CFG.roundMs, itName };
    this.nextPowerupAt = now + CFG.powerup.spawnEveryMs / 2;
    for (const e of this.ents.values()) {
      e.frozenUntil = 0;
      if (e.infected) this.hint(e.id, 'You are IT! Tag them all', 300, INFECTED_COLOR);
      else this.hint(e.id, `RUN! ${itName} is IT`, 150);
    }
  }

  private endRound(now: number): void {
    if (!this.ctx || this.phase.kind !== 'play') return;
    const { startedAt } = this.phase;
    const rows: RankRow[] = [];
    for (const e of this.ents.values()) {
      const p = this.ctx.players.get(e.id);
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
    this.phase = { kind: 'results', endsAt: now + CFG.resultsMs, ranking: rows, survivorsWon };
    this.powerups = [];
    rows.forEach((r, i) => {
      const e = this.ents.get(r.id);
      if (!e) return;
      e.frozenUntil = this.phase.kind === 'results' ? this.phase.endsAt : 0;
      const p = this.ctx?.players.get(r.id);
      this.hint(r.id, r.survived ? `You survived! #${i + 1}` : r.wasIt ? `You were IT · #${i + 1}` : `Infected · #${i + 1}`, 100, p?.color);
    });
  }

  private toLobby(): void {
    this.phase = { kind: 'lobby' };
    this.powerups = [];
    for (const e of this.ents.values()) {
      resetForLobby(e);
      this.respawn(e);
      const p = this.ctx?.players.get(e.id);
      this.hint(e.id, 'Press A when ready · B = dash', 0, p?.color);
    }
  }

  // ---------- mechanics ----------

  private tryDash(e: Ent, now: number): void {
    if (e.dashCooldownUntil > now || e.frozenUntil > now) return;
    e.dashX = e.faceX;
    e.dashY = e.faceY;
    e.dashUntil = now + CFG.dash.durationMs;
    e.dashCooldownUntil = now + CFG.dash.cooldownMs;
    this.hint(e.id, undefined, 30);
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
          this.hint(s.id, 'Shield saved you! RUN', 120);
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
    this.hint(s.id, 'INFECTED! Tag the others', 250, INFECTED_COLOR);
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
        if (e.infected) e.speedUntil = now + CFG.powerup.speedMs; // useless to the infected: give speed instead
        else e.shield = true;
        break;
      case 'freeze':
        for (const o of this.ents.values()) if (o.infected !== e.infected) o.frozenUntil = now + CFG.powerup.freezeMs;
        break;
    }
    this.hint(e.id, POWERUPS[kind].label, 60);
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

  private hint(id: PlayerId, text?: string, vibrate = 0, color?: string): void {
    const ui: { text?: string; vibrate?: number; color?: string } = {};
    if (text !== undefined) ui.text = text.slice(0, 40);
    if (vibrate) ui.vibrate = vibrate;
    if (color) ui.color = color;
    if (Object.keys(ui).length) this.ctx?.sendToPlayer(id, ui);
  }

  private hintAll(text: string, vibrate = 0): void {
    this.ctx?.sendToAll(vibrate ? { text, vibrate } : { text });
  }

  private handleKey(e: KeyboardEvent): void {
    const t = e.target as HTMLElement | null;
    if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return;
    const now = performance.now();
    if (e.code === 'KeyG' && this.phase.kind === 'lobby' && this.ents.size >= 1) this.startCountdown(now);
    if (e.code === 'KeyR') this.toLobby();
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
