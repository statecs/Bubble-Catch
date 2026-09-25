/** Floor, HUD and overlays for Paint to Conquer. Goo bodies are in goo.ts. */
import type { PlayerId } from '@party/contract';
import { ART, CFG } from './config';
import { drawGoo, gooCard, gooText } from './goo';
import type { PaintLayer } from './paint';
import type { Bomb, Drip, Goo, GooInfo, Phase, Score, SplatFx } from './state';

export interface RenderInput {
  g: CanvasRenderingContext2D;
  width: number;
  height: number;
  now: number;
  phase: Phase;
  paused: boolean;
  goos: ReadonlyMap<PlayerId, Goo>;
  info: (id: PlayerId) => GooInfo | undefined;
  paint: PaintLayer;
  bombs: readonly Bomb[];
  splats: readonly SplatFx[];
  drips: readonly Drip[];
  scores: readonly Score[];
}

const HOST_KEYS = 'host: G start · Esc pause · R reset · +/− bots';

export function render(r: RenderInput): void {
  const { g, width, height } = r;
  drawFloor(g, width, height);
  g.drawImage(r.paint.canvas, 0, 0);
  for (const d of r.drips) drawDrip(g, d, r.now);
  for (const s of r.splats) drawSplat(g, s, r.now);
  for (const b of r.bombs) drawBomb(g, b, r.now);
  const sorted = [...r.goos.values()].sort((a, b) => a.y - b.y);
  for (const goo of sorted) {
    const info = r.info(goo.id);
    if (!info) continue;
    drawGoo(g, {
      x: goo.x,
      y: goo.y,
      r: CFG.radius,
      color: info.color,
      vx: goo.vx,
      vy: goo.vy,
      maxSpeed: CFG.speed * CFG.dash.speedMult,
      t: r.now,
      seed: goo.seed,
      squish: goo.squish,
      alpha: info.connected ? 1 : 0.45,
      lookX: goo.faceX,
      lookY: goo.faceY,
    });
    drawBadge(g, goo, info, r);
  }
  drawHud(r);
  if (r.paused) drawPaused(r);
}

function drawFloor(g: CanvasRenderingContext2D, w: number, h: number) {
  const grad = g.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.2, w / 2, h / 2, Math.max(w, h) * 0.75);
  grad.addColorStop(0, ART.floorLight);
  grad.addColorStop(1, ART.floor);
  g.fillStyle = grad;
  g.fillRect(0, 0, w, h);
  // hand-drawn speckle
  g.fillStyle = 'rgba(255,255,255,0.035)';
  for (let i = 0; i < 90; i++) {
    const x = ((i * 7919) % 1000) / 1000 * w;
    const y = ((i * 104729) % 1000) / 1000 * h;
    g.beginPath();
    g.arc(x, y, 1 + ((i * 31) % 3), 0, Math.PI * 2);
    g.fill();
  }
}

function drawBadge(g: CanvasRenderingContext2D, goo: Goo, info: GooInfo, r: RenderInput) {
  const R = CFG.radius;
  gooText(g, info.name, goo.x, goo.y + R + 16, 15, ART.paper, 0);
  if (r.phase.kind === 'lobby') {
    const txt = goo.ready ? 'ready!' : goo.hasMoved ? 'press A' : 'move the stick';
    gooText(g, txt, goo.x, goo.y - R - 16, 13, goo.ready ? ART.accent : ART.paperDim, -0.04);
  }
}

function drawBomb(g: CanvasRenderingContext2D, b: Bomb, now: number) {
  const pulse = 1 + 0.1 * Math.sin((now - b.spawnedAt) / 150);
  const R = CFG.bomb.radius * pulse;
  g.save();
  g.translate(b.x, b.y);
  // fuse
  g.strokeStyle = ART.ink;
  g.lineWidth = 3;
  g.beginPath();
  g.moveTo(0, -R * 0.8);
  g.quadraticCurveTo(R * 0.6, -R * 1.6, R * 1.1, -R * 1.3);
  g.stroke();
  g.fillStyle = ART.accent;
  g.beginPath();
  g.arc(R * 1.1, -R * 1.3, 3 + Math.sin(now / 60) * 1.2, 0, Math.PI * 2);
  g.fill();
  // rainbow body: paint of everyone
  const grad = g.createLinearGradient(-R, -R, R, R);
  grad.addColorStop(0, '#ef4444');
  grad.addColorStop(0.5, '#eab308');
  grad.addColorStop(1, '#3b82f6');
  g.fillStyle = grad;
  g.beginPath();
  g.arc(0, 0, R, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = ART.ink;
  g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath();
  g.ellipse(-R * 0.3, -R * 0.35, R * 0.3, R * 0.18, -0.5, 0, Math.PI * 2);
  g.fill();
  g.restore();
}

function drawSplat(g: CanvasRenderingContext2D, s: SplatFx, now: number) {
  const u = Math.min(1, (now - s.start) / 320);
  const ease = 1 - (1 - u) ** 3;
  g.save();
  g.globalAlpha = 1 - u;
  g.strokeStyle = s.color;
  g.lineWidth = 6 * (1 - u) + 1;
  g.beginPath();
  g.arc(s.x, s.y, s.radius * ease, 0, Math.PI * 2);
  g.stroke();
  g.restore();
}

function drawDrip(g: CanvasRenderingContext2D, d: Drip, now: number) {
  const u = Math.min(1, (now - d.start) / 600);
  const len = d.length * (1 - (1 - u) ** 2);
  g.fillStyle = d.color;
  g.beginPath();
  g.roundRect(d.x - d.width / 2, d.y, d.width, len, d.width / 2);
  g.fill();
  g.beginPath();
  g.arc(d.x, d.y + len, d.width * 0.8, 0, Math.PI * 2);
  g.fill();
}

function drawHud(r: RenderInput) {
  const { g, width, height, now, phase } = r;
  switch (phase.kind) {
    case 'lobby': {
      const connected = [...r.goos.values()].filter((x) => r.info(x.id)?.connected);
      const ready = connected.filter((x) => x.ready).length;
      gooText(g, 'PAINT TO CONQUER', width / 2, 74, 44, ART.accent, -0.025);
      const need = Math.max(CFG.minPlayers - connected.length, 0);
      gooText(g, need > 0 ? `${ready}/${connected.length} ready · need ${need} more` : `${ready}/${connected.length} ready`, width / 2, 116, 22, ART.paper, 0.01);
      drawHowTo(g, width, height, now);
      footer(g, width, height, HOST_KEYS);
      break;
    }
    case 'countdown': {
      const s = Math.max(1, Math.ceil((phase.endsAt - now) / 1000));
      gooText(g, String(s), width / 2, height * 0.22, Math.round(height * 0.28), ART.accent, -0.05);
      gooCard(g, width / 2 - 300, height * 0.55, 600, 150, now);
      gooText(g, 'Cover the floor in YOUR colour', width / 2, height * 0.55 + 42, 28, ART.paper, -0.01);
      gooText(g, 'Paint over others to steal it', width / 2, height * 0.55 + 80, 22, ART.paperDim, 0.01);
      gooText(g, 'A = splat  ·  B = dash  ·  grab the bombs', width / 2, height * 0.55 + 116, 20, ART.accent, -0.01);
      break;
    }
    case 'play': {
      const left = Math.max(0, phase.endsAt - now);
      const ss = Math.ceil(left / 1000);
      gooText(g, `${ss}`, width / 2, 40, 54, ss <= 10 ? '#ff6b6b' : ART.paper, -0.03);
      drawShareBar(g, r.scores, width, 84);
      footer(g, width, height, HOST_KEYS);
      break;
    }
    case 'results': {
      g.fillStyle = 'rgba(14,13,11,0.7)';
      g.fillRect(0, 0, width, height);
      const winner = phase.scores[0];
      gooText(g, winner ? `${winner.name} conquered the floor!` : 'Nobody painted?!', width / 2, 60, 40, ART.accent, -0.02);
      drawJars(g, phase.scores, width, height, Math.min(1, (now - phase.startedAt) / 1600));
      gooText(g, `Next round in ${Math.ceil(Math.max(0, phase.endsAt - now) / 1000)} s`, width / 2, height - 40, 20, ART.paperDim, 0);
      break;
    }
  }
}

function drawShareBar(g: CanvasRenderingContext2D, scores: readonly Score[], w: number, y: number) {
  const barW = Math.min(720, w - 80);
  const x0 = (w - barW) / 2;
  const h = 26;
  g.save();
  g.beginPath();
  g.roundRect(x0, y, barW, h, 13);
  g.fillStyle = 'rgba(20,18,15,0.92)';
  g.fill();
  g.clip();
  let x = x0;
  const painted = scores.reduce((a, s) => a + s.share, 0);
  for (const s of scores) {
    const ww = barW * s.share;
    g.fillStyle = s.color;
    g.fillRect(x, y, ww, h);
    if (ww > 60) gooText(g, `${s.name} ${Math.round(s.share * 100)}%`, x + ww / 2, y + h / 2, 14, ART.paper, 0);
    x += ww;
  }
  g.restore();
  g.lineWidth = 3;
  g.strokeStyle = ART.ink;
  g.beginPath();
  g.roundRect(x0, y, barW, h, 13);
  g.stroke();
  gooText(g, `${Math.round(painted * 100)}% painted`, x0 + barW + 12, y + h / 2, 14, ART.paperDim, 0, 'left');
}

function drawJars(g: CanvasRenderingContext2D, scores: readonly Score[], w: number, h: number, anim: number) {
  const top = scores.slice(0, 8);
  const jarW = Math.min(110, (w - 120) / Math.max(1, top.length) - 20);
  const jarH = h * 0.45;
  const totalW = top.length * (jarW + 20) - 20;
  let x = (w - totalW) / 2;
  const y0 = h * 0.28;
  const maxShare = top[0]?.share || 1;
  const ease = 1 - (1 - anim) ** 3;
  top.forEach((s, i) => {
    const fill = (s.share / maxShare) * ease;
    const fillH = jarH * fill;
    // jar
    g.fillStyle = 'rgba(255,255,255,0.06)';
    g.beginPath();
    g.roundRect(x, y0, jarW, jarH, 14);
    g.fill();
    // goo fill with wobbly top
    g.save();
    g.beginPath();
    g.roundRect(x, y0, jarW, jarH, 14);
    g.clip();
    g.fillStyle = s.color;
    g.beginPath();
    const topY = y0 + jarH - fillH;
    g.moveTo(x, y0 + jarH);
    for (let k = 0; k <= 10; k++) {
      const px = x + (k / 10) * jarW;
      g.lineTo(px, topY + Math.sin(k * 1.3 + anim * 12 + i) * 3);
    }
    g.lineTo(x + jarW, y0 + jarH);
    g.closePath();
    g.fill();
    g.restore();
    g.lineWidth = 4;
    g.strokeStyle = ART.ink;
    g.beginPath();
    g.roundRect(x, y0, jarW, jarH, 14);
    g.stroke();
    gooText(g, `${Math.round(s.share * 100 * ease)}%`, x + jarW / 2, topY - 18, 22, ART.paper, -0.03);
    gooText(g, `${i + 1}. ${s.name}`, x + jarW / 2, y0 + jarH + 22, 16, i === 0 ? ART.accent : ART.paper, 0);
    x += jarW + 20;
  });
}

function drawHowTo(g: CanvasRenderingContext2D, w: number, h: number, now: number) {
  const cardW = Math.min(640, w - 40);
  const cardH = 150;
  const x = (w - cardW) / 2;
  const y = h - cardH - 40;
  gooCard(g, x, y, cardW, cardH, now);
  gooText(g, 'YOUR PHONE', x + cardW / 2, y + 26, 18, ART.paperDim, 0);
  // stick
  const sx = x + 80;
  const sy = y + 88;
  g.fillStyle = 'rgba(255,255,255,0.12)';
  g.beginPath();
  g.arc(sx, sy, 30, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = ART.paper;
  g.beginPath();
  g.arc(sx + 9, sy - 5, 14, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = ART.ink;
  g.stroke();
  gooText(g, 'move & paint', sx, sy + 46, 14, ART.paper, 0);
  // buttons
  const bx = x + cardW - 150;
  const by = y + 92;
  padBtn(g, bx, by, '#e05656', 'B');
  gooText(g, 'dash', bx, by + 40, 14, ART.paper, 0);
  padBtn(g, bx + 80, by - 18, '#3fae5a', 'A');
  gooText(g, 'ready / splat', bx + 80, by + 40, 14, ART.paper, 0);
  gooText(g, 'Scan · name · move', x + cardW / 2 - 10, y + 76, 19, ART.paper, -0.01);
  gooText(g, 'then press A', x + cardW / 2 - 10, y + 104, 19, ART.paper, 0.01);
}

function padBtn(g: CanvasRenderingContext2D, x: number, y: number, color: string, t: string) {
  g.fillStyle = color;
  g.beginPath();
  g.arc(x, y, 22, 0, Math.PI * 2);
  g.fill();
  g.lineWidth = 3;
  g.strokeStyle = ART.ink;
  g.stroke();
  gooText(g, t, x, y + 1, 20, '#fff', 0);
}

function drawPaused(r: RenderInput) {
  const { g, width, height, now } = r;
  g.fillStyle = 'rgba(14,13,11,0.6)';
  g.fillRect(0, 0, width, height);
  gooText(g, 'PAUSED', width / 2, height / 2 - 20, 80, ART.accent, -0.04 + 0.01 * Math.sin(now / 400));
  gooText(g, 'Esc or Resume to continue', width / 2, height / 2 + 44, 22, ART.paperDim, 0);
}

function footer(g: CanvasRenderingContext2D, w: number, h: number, text: string) {
  g.font = `500 13px system-ui, sans-serif`;
  g.fillStyle = 'rgba(255,244,214,0.4)';
  g.textAlign = 'center';
  g.textBaseline = 'bottom';
  g.fillText(text, w / 2, h - 8);
}
