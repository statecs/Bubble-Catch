/** Meadow overlays: lobby title + phone card, countdown rules, round timer, results, pause. Paper-and-ink style. */
import { COLLECTIBLE_EMOJI, INK, PAPER, withAlpha } from '@party/world';

export const HAND = '"Comic Sans MS", "Chalkboard SE", "Marker Felt", system-ui, sans-serif';
const HOST_KEYS = 'host: G start · Esc pause · R reset · +/− bots';

export interface RankRow {
  name: string;
  animal: string;
  accent: string;
  score: number;
}

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'countdown'; endsAt: number }
  | { kind: 'round'; endsAt: number }
  | { kind: 'results'; endsAt: number; ranking: RankRow[] };

export interface HudInput {
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  /** Game clock (s). Stops while paused. */
  clock: number;
  phase: Phase;
  paused: boolean;
  roundTime: number;
  /** Connected players (bots count), and how many of them are ready. */
  connected: number;
  ready: number;
  minPlayers: number;
  leader: { name: string; score: number } | null;
}

export function drawHud(h: HudInput): void {
  const { g, width, height, phase } = h;
  switch (phase.kind) {
    case 'lobby': {
      title(g, width / 2, 20, 'MEADOW');
      const need = Math.max(h.minPlayers - h.connected, 0);
      text(
        g,
        need > 0
          ? `${h.ready}/${h.connected} ready · need ${need} more player${need === 1 ? '' : 's'}`
          : `${h.ready}/${h.connected} ready`,
        width / 2,
        78,
        `700 20px ${HAND}`,
        INK,
      );
      footer(g, width, height);
      break;
    }
    case 'countdown': {
      const s = Math.max(1, Math.ceil(phase.endsAt - h.clock));
      text(g, String(s), width / 2, 20, `700 ${Math.round(height * 0.2)}px ${HAND}`, INK);
      rulesCard(g, width, height, h.roundTime);
      break;
    }
    case 'round': {
      const left = Math.max(0, Math.ceil(phase.endsAt - h.clock));
      const clockText = `${Math.floor(left / 60)}:${(left % 60).toString().padStart(2, '0')}`;
      paperBox(g, width / 2, 12, `700 30px ${HAND}`, clockText, left <= 10 ? '#f87171' : '#facc15');
      if (h.leader && h.leader.score > 0) {
        text(g, `leader: ${h.leader.name} · ${h.leader.score}`, width / 2, 62, `700 17px ${HAND}`, INK);
      }
      footer(g, width, height);
      break;
    }
    case 'results':
      resultsCard(g, width, height, phase.ranking, Math.ceil(Math.max(0, phase.endsAt - h.clock)));
      footer(g, width, height);
      break;
  }
  if (h.paused) pausedOverlay(g, width, height);
}

/** Top-centre badge drawn above an animal during the lobby. */
export function lobbyBadge(
  g: CanvasRenderingContext2D,
  x: number,
  y: number,
  state: 'move' | 'ready-up' | 'ready',
): void {
  const [label, color] =
    state === 'ready' ? ['✓ READY', '#16a34a'] : state === 'ready-up' ? ['press A when ready', '#d97706'] : ['move the stick', withAlpha(INK, 0.55)];
  text(g, label, x, y, `700 15px ${HAND}`, color, 'bottom');
}

// ---------- cards ----------

/** Space the lobby phone card takes at the bottom of the screen (card + footer), in css px. */
export const PHONE_CARD_SPACE = 150 + 44;

/**
 * Lobby: a drawn phone pad with labels, so joiners can see what to do from the back of the room.
 * Drawn under the animals so nobody gets hidden behind it.
 */
export function drawPhoneCard(g: CanvasRenderingContext2D, w: number, h: number): void {
  const cardW = Math.min(680, w - 40);
  const cardH = 150;
  const x = (w - cardW) / 2;
  const y = h - PHONE_CARD_SPACE;
  card(g, x, y, cardW, cardH);
  text(g, 'YOUR PHONE', x + cardW / 2, y + 12, `700 18px ${HAND}`, INK);

  // stick
  const sx = x + 90;
  const sy = y + 78;
  g.fillStyle = withAlpha(INK, 0.12);
  g.strokeStyle = INK;
  g.lineWidth = 2;
  circle(g, sx, sy, 32);
  g.fill();
  g.stroke();
  g.fillStyle = '#e2e8f0';
  circle(g, sx + 9, sy - 6, 15);
  g.fill();
  g.stroke();
  label(g, sx, sy + 40, 'STICK', 'walk');

  // buttons
  const bx = x + cardW - 150;
  const by = y + 84;
  padButton(g, bx, by, '#ef4444', 'B');
  label(g, bx, by + 28, 'B', 'dash');
  padButton(g, bx + 84, by - 16, '#16a34a', 'A');
  label(g, bx + 84, by + 28, 'A', 'hop · ready');

  const mid = x + cardW / 2 - 10;
  text(g, 'Scan the QR · enter a name', mid, y + 56, `500 17px ${HAND}`, INK);
  text(g, 'walk around · press A', mid, y + 80, `500 17px ${HAND}`, INK);
  text(g, `collect ${Object.values(COLLECTIBLE_EMOJI).join(' ')}`, mid, y + 104, `500 15px ${HAND}`, withAlpha(INK, 0.7));
}

function rulesCard(g: CanvasRenderingContext2D, w: number, h: number, roundTime: number): void {
  const items = Object.values(COLLECTIBLE_EMOJI).join(' ');
  const lines: Array<[string, string]> = [
    [`700 38px ${HAND}`, `Collect ${items}`],
    [`600 26px ${HAND}`, `Most items in ${roundTime} s wins`],
    [`600 22px ${HAND}`, 'A = hop · B = dash'],
  ];
  const cardW = Math.min(620, w - 40);
  const cardH = lines.length * 48 + 30;
  const x = (w - cardW) / 2;
  const y = h * 0.5 - 20;
  card(g, x, y, cardW, cardH);
  lines.forEach(([font, t], i) => text(g, t, w / 2, y + 18 + i * 48, font, INK));
}

function resultsCard(g: CanvasRenderingContext2D, w: number, h: number, ranking: RankRow[], nextIn: number): void {
  g.fillStyle = withAlpha(PAPER, 0.55);
  g.fillRect(0, 0, w, h);
  const rows = ranking.slice(0, 8);
  const cardW = Math.min(520, w - 40);
  const cardH = 120 + rows.length * 40 + 50;
  const x = (w - cardW) / 2;
  const y = Math.max(20, (h - cardH) / 2);
  card(g, x, y, cardW, cardH);

  const top = rows[0]?.score ?? 0;
  const winners = rows.filter((r) => r.score === top);
  const head =
    top === 0 ? 'Nobody collected anything!' : winners.length === 1 ? `${winners[0]!.name} wins!` : "It's a tie!";
  title(g, w / 2, y + 20, head);

  let ry = y + 90;
  rows.forEach((r, i) => {
    const win = r.score === top && top > 0;
    g.fillStyle = r.accent;
    g.strokeStyle = INK;
    g.lineWidth = 2;
    circle(g, x + 40, ry + 14, 11);
    g.fill();
    g.stroke();
    text(g, `${i + 1}. ${r.name}`, x + 62, ry, `${win ? 700 : 500} 22px ${HAND}`, INK, 'top', 'left');
    text(g, r.animal, x + cardW - 120, ry + 3, `500 16px ${HAND}`, withAlpha(INK, 0.6), 'top', 'right');
    text(g, String(r.score), x + cardW - 36, ry, `700 22px ${HAND}`, INK, 'top', 'right');
    ry += 40;
  });
  text(g, `Next round in ${nextIn} s`, w / 2, ry + 14, `500 18px ${HAND}`, withAlpha(INK, 0.75));
}

function pausedOverlay(g: CanvasRenderingContext2D, w: number, h: number): void {
  g.fillStyle = withAlpha(PAPER, 0.6);
  g.fillRect(0, 0, w, h);
  const cardW = 380;
  const cardH = 130;
  card(g, (w - cardW) / 2, (h - cardH) / 2, cardW, cardH);
  text(g, 'Paused', w / 2, h / 2 - 48, `700 52px ${HAND}`, INK);
  text(g, 'Esc or Resume to continue', w / 2, h / 2 + 18, `500 18px ${HAND}`, withAlpha(INK, 0.75));
}

// ---------- primitives ----------

function card(g: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  g.save();
  g.fillStyle = PAPER;
  g.strokeStyle = INK;
  g.lineWidth = 3;
  g.beginPath();
  g.roundRect(x, y, w, h, 16);
  g.fill();
  g.stroke();
  g.restore();
}

function paperBox(g: CanvasRenderingContext2D, cx: number, y: number, font: string, t: string, accent: string): void {
  g.font = font;
  const w = g.measureText(t).width + 32;
  const h = 44;
  card(g, cx - w / 2, y, w, h);
  g.fillStyle = accent;
  g.fillRect(cx - w / 2 + 10, y + h - 9, w - 20, 4);
  text(g, t, cx, y + 5, font, INK);
}

function title(g: CanvasRenderingContext2D, x: number, y: number, t: string): void {
  text(g, t, x, y, `700 44px ${HAND}`, INK);
}

function label(g: CanvasRenderingContext2D, x: number, y: number, head: string, body: string): void {
  text(g, head, x, y, `700 12px ${HAND}`, withAlpha(INK, 0.55));
  text(g, body, x, y + 14, `700 15px ${HAND}`, INK);
}

function padButton(g: CanvasRenderingContext2D, x: number, y: number, color: string, t: string): void {
  g.fillStyle = color;
  g.strokeStyle = INK;
  g.lineWidth = 2;
  circle(g, x, y, 22);
  g.fill();
  g.stroke();
  g.fillStyle = '#fff';
  g.font = `800 20px ${HAND}`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(t, x, y + 1);
}

function footer(g: CanvasRenderingContext2D, w: number, h: number): void {
  text(g, HOST_KEYS, w / 2, h - 10, `500 13px ${HAND}`, withAlpha(INK, 0.5), 'bottom');
}

function circle(g: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  g.beginPath();
  g.arc(x, y, r, 0, Math.PI * 2);
}

function text(
  g: CanvasRenderingContext2D,
  t: string,
  x: number,
  y: number,
  font: string,
  color: string,
  baseline: CanvasTextBaseline = 'top',
  align: CanvasTextAlign = 'center',
): void {
  g.font = font;
  g.fillStyle = color;
  g.textAlign = align;
  g.textBaseline = baseline;
  g.fillText(t, x, y);
}
