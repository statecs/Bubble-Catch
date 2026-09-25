import './style.css';
import {
  JoinCode,
  PlayerName,
  type InputState,
  type JoinErrorReason,
  type Player,
  type PlayerUi,
  type SocketStatus,
} from '@party/contract';
import { ControllerConnection } from './connection';
import { getSavedCode, getSavedName, saveCode, saveName } from './identity';
import { createPad, type Pad } from './pad';

const app = document.getElementById('app')!;
const params = new URLSearchParams(location.search);
const MOCK = params.get('mock') === '1';

const JOIN_ERRORS: Record<JoinErrorReason, string> = {
  room_not_found: 'No room with that code. Check the code on the big screen.',
  name_taken: 'That name is already taken in this room. Try another.',
  room_full: 'This room is full.',
  invalid: 'That code or name is not valid.',
};

function h<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (cls) el.className = cls;
  if (text !== undefined) el.textContent = text;
  return el;
}

/** Uppercase and strip characters that can never be in a join code (incl. I and O). */
const cleanCode = (s: string) => s.toUpperCase().replace(/[^A-HJ-NP-Z]/g, '').slice(0, 4);

let pad: Pad | null = null;
let status: SocketStatus = 'closed';
let statusDot: HTMLElement | null = null;
let swatch: HTMLElement | null = null;
let uiText: HTMLElement | null = null;

function clearScreen() {
  pad?.destroy();
  pad = null;
  statusDot = swatch = uiText = null;
  app.replaceChildren();
}

// ---------- join screen ----------

function showJoin(message = '', busy = false) {
  clearScreen();
  const form = h('form', 'join');
  const title = h('h1', 'join-title', 'Join game');

  const codeIn = h('input', 'field code');
  codeIn.placeholder = 'CODE';
  codeIn.maxLength = 4;
  codeIn.autocomplete = 'off';
  codeIn.autocapitalize = 'characters';
  codeIn.spellcheck = false;
  codeIn.inputMode = 'text';
  codeIn.value = cleanCode(params.get('code') ?? getSavedCode());
  codeIn.addEventListener('input', () => {
    const v = cleanCode(codeIn.value);
    if (v !== codeIn.value) codeIn.value = v;
  });

  const nameIn = h('input', 'field name');
  nameIn.placeholder = 'Your name';
  nameIn.maxLength = 16;
  nameIn.autocomplete = 'off';
  nameIn.value = getSavedName().slice(0, 16);

  const btn = h('button', 'join-btn', busy ? 'Joining…' : 'Join');
  btn.type = 'submit';
  btn.disabled = busy;
  const err = h('p', 'join-error', message);

  form.append(title, label('Room code', codeIn), label('Name', nameIn), btn, err);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const code = cleanCode(codeIn.value);
    const name = nameIn.value.trim();
    if (!JoinCode.safeParse(code).success) {
      err.textContent = 'Enter the 4-letter code shown on the big screen.';
      return;
    }
    if (!PlayerName.safeParse(name).success) {
      err.textContent = 'Enter a name (1-16 characters).';
      return;
    }
    saveCode(code);
    saveName(name);
    btn.disabled = true;
    btn.textContent = 'Joining…';
    err.textContent = status === 'open' ? '' : 'Connecting…';
    joinStatusLine = err;
    conn?.join(code, name);
  });

  app.appendChild(form);
  if (!codeIn.value) codeIn.focus();
}

function label(text: string, input: HTMLElement) {
  const l = h('label', 'lbl');
  l.append(h('span', 'lbl-text', text), input);
  return l;
}

let joinStatusLine: HTMLElement | null = null;

// ---------- pad screen ----------

function showPad(player: Player, onLeave: () => void, send: (i: InputState) => void) {
  clearScreen();
  const screen = h('div', 'screen');
  const bar = h('div', 'bar');
  swatch = h('span', 'swatch');
  swatch.style.background = player.color;
  const name = h('span', 'pname', player.name);
  uiText = h('span', 'uitext');
  statusDot = h('span', 'dot');
  renderStatus();
  const leave = h('a', 'leave', 'Leave');
  leave.href = '#';
  leave.addEventListener('click', (e) => {
    e.preventDefault();
    onLeave();
  });
  bar.append(swatch, name, uiText, statusDot, leave);

  pad = createPad(send);
  screen.append(bar, pad.el);
  app.appendChild(screen);
}

function applyUi(ui: PlayerUi) {
  if (ui.color !== undefined && swatch) swatch.style.background = ui.color;
  if (ui.text !== undefined && uiText) uiText.textContent = ui.text;
  if (ui.vibrate) navigator.vibrate?.(ui.vibrate);
}

function renderStatus() {
  if (!statusDot) return;
  statusDot.dataset.status = status;
  statusDot.title = status;
}

// ---------- wiring ----------

let conn: ControllerConnection | null = null;

if (MOCK) {
  startMock();
} else {
  conn = new ControllerConnection({
    status(s) {
      status = s;
      renderStatus();
      if (joinStatusLine?.isConnected && s !== 'open' && !conn?.isJoined) joinStatusLine.textContent = 'Connecting…';
    },
    joined(player) {
      // Re-joins after a reconnect also land here; keep the pad if already showing.
      if (pad) {
        if (swatch) swatch.style.background = player.color;
        return;
      }
      showPad(
        player,
        () => {
          conn?.leave();
          showJoin();
        },
        (input) => conn?.sendInput(input),
      );
    },
    joinError(reason) {
      showJoin(JOIN_ERRORS[reason] ?? 'Could not join.');
    },
    ui: applyUi,
    kicked() {
      showJoin('You were removed from the room.');
    },
    roomClosed() {
      showJoin('The room was closed.');
    },
  });
  showJoin();
}

function startMock() {
  status = 'open';
  let count = 0;
  const lines: string[] = [];
  const fmt = (i: InputState) =>
    `x=${i.axis.x.toFixed(2).padStart(5)} y=${i.axis.y.toFixed(2).padStart(5)} a=${i.buttons.a ? 1 : 0} b=${i.buttons.b ? 1 : 0}`;
  const logBox = h('pre', 'mocklog');
  const counter = h('div', 'mockcount', 'sends: 0');
  const player: Player = { id: 'mock-player', name: 'Mock', color: '#3b82f6', connected: true };
  showPad(
    player,
    () => location.reload(),
    (input) => {
      count++;
      const t = (performance.now() / 1000).toFixed(2);
      lines.push(`${t} ${fmt(input)}`);
      if (lines.length > 8) lines.shift();
      logBox.textContent = lines.join('\n');
      counter.textContent = `sends: ${count}`;
    },
  );
  applyUi({ text: 'mock mode' });
  const overlay = h('div', 'mock');
  overlay.append(counter, logBox);
  app.querySelector('.screen')?.appendChild(overlay);
}
