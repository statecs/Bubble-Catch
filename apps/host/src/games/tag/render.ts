/** Canvas drawing for Tag. Deliberately plain; polish comes later. */
import type { Player, PlayerId } from '@party/contract';
import { CFG, INFECTED_COLOR, POWERUPS } from './config';
import type { Ent, Phase, Powerup } from './state';

export interface RenderInput {
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  now: number;
  phase: Phase;
  ents: ReadonlyMap<PlayerId, Ent>;
  players: ReadonlyMap<PlayerId, Player>;
  powerups: readonly Powerup[];
}

const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';

export function render(r: RenderInput): void {
  const { g, width, height } = r;
  g.clearRect(0, 0, width, height);
  drawGrid(g, width, height);
  for (const p of r.powerups) drawPowerup(g, p, r.now);
  for (const e of r.ents.values()) {
    const player = r.players.get(e.id);
    if (player) drawEnt(g, e, player, r);
  }
  drawHud(r);
}

function drawGrid(g: CanvasRenderingContext2D, w: number, h: number) {
  g.strokeStyle = 'rgba(148,163,184,0.08)';
  g.lineWidth = 1;
  const step = 60;
  g.beginPath();
  for (let x = step; x < w; x += step) {
    g.moveTo(x, 0);
    g.lineTo(x, h);
  }
  for (let y = step; y < h; y += step) {
    g.moveTo(0, y);
    g.lineTo(w, y);
  }
  g.stroke();
}

function drawPowerup(g: CanvasRenderingContext2D, p: Powerup, now: number) {
  const def = POWERUPS[p.kind];
  const pulse = 1 + 0.08 * Math.sin((now - p.spawnedAt) / 180);
  const r = CFG.powerup.radius * pulse;
  g.fillStyle = def.color;
  g.globalAlpha = 0.25;
  g.beginPath();
  g.arc(p.x, p.y, r + 6, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 1;
  g.beginPath();
  g.arc(p.x, p.y, r, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#0f172a';
  g.font = `${Math.round(r * 1.2)}px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(def.glyph, p.x, p.y + 1);
}

function drawEnt(g: CanvasRenderingContext2D, e: Ent, player: Player, r: RenderInput) {
  const { now, phase } = r;
  const R = CFG.radius;
  const frozen = e.frozenUntil > now && phase.kind === 'play';
  g.globalAlpha = player.connected ? 1 : 0.4;

  // status rings (outer to inner)
  if (e.speedUntil > now) ring(g, e, R + 12, POWERUPS.speed.color, 3);
  if (e.shield) ring(g, e, R + 7, POWERUPS.shield.color, 4);
  if (e.immuneUntil > now) ring(g, e, R + 7, 'rgba(255,255,255,0.6)', 2);

  // body
  g.fillStyle = player.color;
  g.beginPath();
  g.arc(e.x, e.y, R, 0, Math.PI * 2);
  g.fill();

  // team outline
  g.lineWidth = 4;
  g.strokeStyle = e.infected ? INFECTED_COLOR : 'rgba(255,255,255,0.85)';
  g.stroke();

  if (frozen) {
    g.fillStyle = 'rgba(147,197,253,0.55)';
    g.beginPath();
    g.arc(e.x, e.y, R, 0, Math.PI * 2);
    g.fill();
  }

  // badge above
  g.font = `700 14px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  if (phase.kind === 'lobby') {
    g.fillStyle = e.ready ? INFECTED_COLOR : 'rgba(148,163,184,0.9)';
    g.fillText(e.ready ? '✓ READY' : 'press A', e.x, e.y - R - 6);
  } else if (e.infected && phase.kind !== 'results') {
    g.fillStyle = INFECTED_COLOR;
    g.fillText(e.wasIt ? 'IT' : '☣', e.x, e.y - R - 6);
  }

  // name
  g.fillStyle = '#f1f5f9';
  g.font = `600 15px ${FONT}`;
  g.textBaseline = 'top';
  g.fillText(player.name, e.x, e.y + R + 6);
  g.globalAlpha = 1;
}

function ring(g: CanvasRenderingContext2D, e: Ent, radius: number, color: string, w: number) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.beginPath();
  g.arc(e.x, e.y, radius, 0, Math.PI * 2);
  g.stroke();
}

function drawHud(r: RenderInput) {
  const { g, width, height, now, phase } = r;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  const connected = [...r.players.values()].filter((p) => p.connected);

  switch (phase.kind) {
    case 'lobby': {
      const ready = [...r.ents.values()].filter((e) => e.ready && r.players.get(e.id)?.connected).length;
      title(g, width, 'TAG', 44);
      sub(g, width, 'Press A on your phone to ready up  ·  B to dash', 92);
      g.fillStyle = INFECTED_COLOR;
      g.font = `700 22px ${FONT}`;
      const need = Math.max(CFG.minPlayers - connected.length, 0);
      g.fillText(
        need > 0 ? `${ready}/${connected.length} ready · need ${need} more player${need === 1 ? '' : 's'}` : `${ready}/${connected.length} ready`,
        width / 2,
        124,
      );
      footer(g, width, height, 'host keys: G start now · R reset');
      break;
    }
    case 'countdown': {
      const s = Math.ceil((phase.endsAt - now) / 1000);
      g.fillStyle = '#f8fafc';
      g.font = `800 ${Math.round(height * 0.3)}px ${FONT}`;
      g.textBaseline = 'middle';
      g.fillText(String(Math.max(s, 1)), width / 2, height / 2);
      g.textBaseline = 'top';
      sub(g, width, 'Someone is about to be IT…', 24);
      break;
    }
    case 'play': {
      const left = Math.max(0, phase.endsAt - now);
      const survivors = [...r.ents.values()].filter((e) => !e.infected).length;
      const mm = Math.floor(left / 60000);
      const ss = Math.floor((left % 60000) / 1000);
      g.fillStyle = '#f8fafc';
      g.font = `800 40px ${FONT}`;
      g.fillText(`${mm}:${ss.toString().padStart(2, '0')}`, width / 2, 16);
      g.fillStyle = 'rgba(241,245,249,0.8)';
      g.font = `600 20px ${FONT}`;
      g.fillText(`${survivors} survivor${survivors === 1 ? '' : 's'} left`, width / 2, 64);
      if (now - phase.startedAt < CFG.revealMs) {
        g.fillStyle = INFECTED_COLOR;
        g.font = `800 56px ${FONT}`;
        g.textBaseline = 'middle';
        g.fillText(`RUN! ${phase.itName} is IT`, width / 2, height / 2);
        g.textBaseline = 'top';
      }
      footer(g, width, height, 'host keys: R reset');
      break;
    }
    case 'results': {
      g.fillStyle = 'rgba(2,6,23,0.75)';
      g.fillRect(0, 0, width, height);
      title(g, width, phase.survivorsWon ? 'SURVIVORS WIN' : 'INFECTION WINS', 40);
      let y = 120;
      g.font = `600 26px ${FONT}`;
      g.textAlign = 'left';
      const x0 = width / 2 - 220;
      phase.ranking.slice(0, 10).forEach((row, i) => {
        g.fillStyle = row.color;
        g.beginPath();
        g.arc(x0 + 14, y + 16, 12, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#f8fafc';
        g.fillText(`${i + 1}. ${row.name}`, x0 + 40, y);
        g.fillStyle = row.survived ? INFECTED_COLOR : 'rgba(241,245,249,0.7)';
        g.textAlign = 'right';
        g.fillText(row.wasIt ? 'was IT' : row.survived ? 'survived' : `${(row.survivedMs / 1000).toFixed(1)} s`, x0 + 440, y);
        g.textAlign = 'left';
        y += 40;
      });
      g.textAlign = 'center';
      sub(g, width, `Next round in ${Math.ceil(Math.max(0, phase.endsAt - now) / 1000)} s`, height - 60);
      break;
    }
  }
}

function title(g: CanvasRenderingContext2D, w: number, text: string, y: number) {
  g.fillStyle = '#fbbf24';
  g.font = `800 40px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(text, w / 2, y);
}
function sub(g: CanvasRenderingContext2D, w: number, text: string, y: number) {
  g.fillStyle = 'rgba(241,245,249,0.85)';
  g.font = `500 20px ${FONT}`;
  g.textAlign = 'center';
  g.fillText(text, w / 2, y);
}
function footer(g: CanvasRenderingContext2D, w: number, h: number, text: string) {
  g.fillStyle = 'rgba(148,163,184,0.5)';
  g.font = `500 13px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(text, w / 2, h - 10);
  g.textBaseline = 'top';
}
