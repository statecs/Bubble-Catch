/** Canvas drawing for Tag. Deliberately plain; polish comes later. */
import type { PlayerId } from '@party/contract';
import { CFG, INFECTED_COLOR, POWERUPS } from './config';
import type { Ent, EntInfo, Phase, Powerup } from './state';

export interface RenderInput {
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Game clock (ms). Stops while paused. */
  now: number;
  phase: Phase;
  paused: boolean;
  ents: ReadonlyMap<PlayerId, Ent>;
  info: (id: PlayerId) => EntInfo | undefined;
  powerups: readonly Powerup[];
}

const FONT = 'system-ui, -apple-system, Segoe UI, sans-serif';
const HOST_KEYS = 'host: G start · Esc pause · R reset · +/− bots';

export function render(r: RenderInput): void {
  const { g, width, height } = r;
  g.clearRect(0, 0, width, height);
  drawGrid(g, width, height);
  for (const p of r.powerups) drawPowerup(g, p, r.now);
  for (const e of r.ents.values()) {
    const info = r.info(e.id);
    if (info) drawEnt(g, e, info, r);
  }
  drawHud(r);
  if (r.paused) drawPaused(r);
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

function drawEnt(g: CanvasRenderingContext2D, e: Ent, info: EntInfo, r: RenderInput) {
  const { now, phase } = r;
  const R = CFG.radius;
  const frozen = e.frozenUntil > now && phase.kind === 'play';
  g.globalAlpha = info.connected ? 1 : 0.4;

  if (e.speedUntil > now) ring(g, e, R + 12, POWERUPS.speed.color, 3);
  if (e.shield) ring(g, e, R + 7, POWERUPS.shield.color, 4);
  if (e.immuneUntil > now) ring(g, e, R + 7, 'rgba(255,255,255,0.6)', 2);

  g.fillStyle = info.color;
  g.beginPath();
  g.arc(e.x, e.y, R, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = e.infected ? INFECTED_COLOR : 'rgba(255,255,255,0.85)';
  g.stroke();

  if (frozen) {
    g.fillStyle = 'rgba(147,197,253,0.55)';
    g.beginPath();
    g.arc(e.x, e.y, R, 0, Math.PI * 2);
    g.fill();
  }

  // badge above the dot
  g.font = `700 14px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  if (phase.kind === 'lobby') {
    if (e.ready) {
      g.fillStyle = INFECTED_COLOR;
      g.fillText('✓ READY', e.x, e.y - R - 6);
    } else {
      g.fillStyle = e.hasMoved ? '#fbbf24' : 'rgba(148,163,184,0.9)';
      g.fillText(e.hasMoved ? 'press A when ready' : 'move the stick', e.x, e.y - R - 6);
    }
  } else if (e.infected && phase.kind !== 'results') {
    g.fillStyle = INFECTED_COLOR;
    g.fillText(e.wasIt ? 'IT' : '☣', e.x, e.y - R - 6);
  }

  g.fillStyle = '#f1f5f9';
  g.font = `600 15px ${FONT}`;
  g.textBaseline = 'top';
  g.fillText(info.name, e.x, e.y + R + 6);
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
  const all = [...r.ents.values()];
  const connected = all.filter((e) => r.info(e.id)?.connected);

  switch (phase.kind) {
    case 'lobby': {
      const ready = connected.filter((e) => e.ready).length;
      title(g, width, 'TAG', 28);
      g.fillStyle = INFECTED_COLOR;
      g.font = `700 22px ${FONT}`;
      const need = Math.max(CFG.minPlayers - connected.length, 0);
      g.fillText(
        need > 0 ? `${ready}/${connected.length} ready · need ${need} more player${need === 1 ? '' : 's'}` : `${ready}/${connected.length} ready`,
        width / 2,
        78,
      );
      drawHowToPlay(g, width, height);
      footer(g, width, height, HOST_KEYS);
      break;
    }
    case 'countdown': {
      const s = Math.ceil((phase.endsAt - now) / 1000);
      g.fillStyle = '#f8fafc';
      g.font = `800 ${Math.round(height * 0.22)}px ${FONT}`;
      g.fillText(String(Math.max(s, 1)), width / 2, 20);
      drawRulesCard(g, width, height);
      break;
    }
    case 'play': {
      const left = Math.max(0, phase.endsAt - now);
      const survivors = all.filter((e) => !e.infected).length;
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
      drawPowerupLegend(g, width, height);
      footer(g, width, height, HOST_KEYS);
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
      footer(g, width, height, HOST_KEYS);
      break;
    }
  }
}

/** Lobby: a drawn phone pad with labels, so joiners can see what to do from the back of the room. */
function drawHowToPlay(g: CanvasRenderingContext2D, w: number, h: number) {
  const cardW = Math.min(680, w - 40);
  const cardH = 150;
  const x = (w - cardW) / 2;
  const y = h - cardH - 44;
  g.fillStyle = 'rgba(15,23,42,0.85)';
  roundRect(g, x, y, cardW, cardH, 16);
  g.fill();
  g.strokeStyle = 'rgba(148,163,184,0.25)';
  g.lineWidth = 1;
  g.stroke();

  g.fillStyle = 'rgba(241,245,249,0.9)';
  g.font = `700 18px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillText('YOUR PHONE', x + cardW / 2, y + 12);

  // stick
  const sx = x + 90;
  const sy = y + 90;
  g.fillStyle = 'rgba(148,163,184,0.25)';
  g.beginPath();
  g.arc(sx, sy, 34, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = 'rgba(203,213,225,0.9)';
  g.beginPath();
  g.arc(sx + 10, sy - 6, 16, 0, Math.PI * 2);
  g.fill();
  label(g, sx, sy + 40, 'STICK', 'move');

  // buttons
  const bx = x + cardW - 150;
  const by = y + 92;
  padButton(g, bx, by, '#ef4444', 'B');
  label(g, bx, by + 30, 'B', 'dash');
  padButton(g, bx + 84, by - 18, '#16a34a', 'A');
  label(g, bx + 84, by + 30, 'A', 'ready up');

  // middle text
  g.fillStyle = 'rgba(241,245,249,0.85)';
  g.font = `500 17px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('Scan the QR · enter a name', x + cardW / 2 - 10, y + 70);
  g.fillText('move around · press A', x + cardW / 2 - 10, y + 94);
}

function drawRulesCard(g: CanvasRenderingContext2D, w: number, h: number) {
  const lines: Array<[string, string]> = [
    [INFECTED_COLOR, 'One of you is IT'],
    ['#f8fafc', 'Get touched → you are infected too'],
    ['#f8fafc', `Survive ${CFG.roundMs / 1000} s and the survivors win`],
    [POWERUPS.speed.color, `${POWERUPS.speed.glyph} speed   ${POWERUPS.shield.glyph} shield   ${POWERUPS.freeze.glyph} freeze the others`],
  ];
  const y0 = h * 0.5;
  g.fillStyle = 'rgba(2,6,23,0.8)';
  g.fillRect(0, y0 - 24, w, lines.length * 48 + 36);
  g.textAlign = 'center';
  g.textBaseline = 'top';
  lines.forEach(([color, text], i) => {
    g.fillStyle = color;
    g.font = `${i === 0 ? 800 : 600} ${i === 0 ? 40 : 28}px ${FONT}`;
    g.fillText(text, w / 2, y0 + i * 48);
  });
}

function drawPowerupLegend(g: CanvasRenderingContext2D, w: number, h: number) {
  g.textAlign = 'left';
  g.textBaseline = 'middle';
  g.font = `600 15px ${FONT}`;
  let x = 16;
  const y = h - 34;
  for (const def of Object.values(POWERUPS)) {
    g.fillStyle = def.color;
    g.beginPath();
    g.arc(x + 10, y, 10, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = '#0f172a';
    g.font = `12px ${FONT}`;
    g.textAlign = 'center';
    g.fillText(def.glyph, x + 10, y + 1);
    g.textAlign = 'left';
    g.font = `600 15px ${FONT}`;
    g.fillStyle = 'rgba(241,245,249,0.8)';
    g.fillText(def.label.replace('!', ''), x + 26, y);
    x += 26 + g.measureText(def.label).width + 22;
  }
  void w;
}

function drawPaused(r: RenderInput) {
  const { g, width, height } = r;
  g.fillStyle = 'rgba(2,6,23,0.6)';
  g.fillRect(0, 0, width, height);
  g.fillStyle = '#f8fafc';
  g.font = `800 72px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('PAUSED', width / 2, height / 2 - 20);
  g.font = `500 22px ${FONT}`;
  g.fillStyle = 'rgba(241,245,249,0.8)';
  g.fillText('Esc or Resume to continue', width / 2, height / 2 + 40);
}

function padButton(g: CanvasRenderingContext2D, x: number, y: number, color: string, t: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, 22, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.font = `800 20px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, x, y + 1);
}
function label(g: CanvasRenderingContext2D, x: number, y: number, head: string, body: string) {
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillStyle = 'rgba(148,163,184,0.9)';
  g.font = `700 12px ${FONT}`;
  g.fillText(head, x, y);
  g.fillStyle = '#f8fafc';
  g.font = `600 15px ${FONT}`;
  g.fillText(body, x, y + 14);
}
function roundRect(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}
function title(g: CanvasRenderingContext2D, w: number, text: string, y: number) {
  g.fillStyle = '#fbbf24';
  g.font = `800 40px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
  g.fillText(text, w / 2, y);
}
function sub(g: CanvasRenderingContext2D, w: number, text: string, y: number) {
  g.fillStyle = 'rgba(241,245,249,0.85)';
  g.font = `500 20px ${FONT}`;
  g.textAlign = 'center';
  g.textBaseline = 'top';
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
