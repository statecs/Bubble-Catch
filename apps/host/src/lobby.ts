/**
 * Lobby sidebar: join code, QR, controller URL, roster, relay status.
 * Pure view: reads the runtime roster and whatever status it is fed.
 */
import QRCode from 'qrcode';
import type { JoinCode, SocketStatus } from '@party/contract';
import type { GameRuntime } from './game/runtime';

const CONTROLLER_URL_KEY = 'party.controllerUrl';

function withTrailingSlash(u: string): string {
  return u.endsWith('/') ? u : `${u}/`;
}

/** Where phones should go. See priority order in the host README / brief. */
export function resolveControllerUrl(): string {
  const fromQuery = new URLSearchParams(location.search).get('controller');
  if (fromQuery) {
    try {
      localStorage.setItem(CONTROLLER_URL_KEY, fromQuery);
    } catch {
      /* ignore */
    }
    return fromQuery;
  }
  let stored: string | null = null;
  try {
    stored = localStorage.getItem(CONTROLLER_URL_KEY);
  } catch {
    /* ignore */
  }
  if (stored) return stored;
  const env = import.meta.env.VITE_CONTROLLER_URL as string | undefined;
  if (env) return env;
  if (import.meta.env.BASE_URL === '/host/') return `${location.origin}/`;
  return `http://${location.hostname}:5174/`;
}

/** Controller URL with `?code=XXXX` set (preserving any existing query). */
export function controllerJoinUrl(base: string, code: JoinCode): string {
  try {
    const u = new URL(base, location.href);
    u.searchParams.set('code', code);
    return u.toString();
  } catch {
    const sep = base.includes('?') ? '&' : '?';
    return `${withTrailingSlash(base)}${sep}code=${encodeURIComponent(code)}`;
  }
}

export interface LobbyOptions {
  gameName: string;
  /** Mock mode: no QR, show key legend instead. */
  mock?: { legend: ReadonlyArray<{ name: string; keys: string }> };
}

export interface Lobby {
  setCode(code: JoinCode | undefined): void;
  setStatus(status: SocketStatus | 'mock'): void;
  setGameName(name: string): void;
  destroy(): void;
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

export function renderLobby(root: HTMLElement, runtime: GameRuntime, opts: LobbyOptions): Lobby {
  root.replaceChildren();

  const status = el('div', 'status-pill');
  const codeLabel = el('div', 'label', 'Join code');
  const code = el('div', 'join-code', '····');
  root.append(status, codeLabel, code);

  const controllerBase = resolveControllerUrl();
  let qrCanvas: HTMLCanvasElement | null = null;
  let urlText: HTMLElement | null = null;

  if (opts.mock) {
    code.textContent = 'MOCK';
    const legend = el('div', 'legend');
    for (const row of opts.mock.legend) {
      const line = el('div', 'legend-row');
      line.append(el('span', 'legend-name', row.name), el('span', 'legend-keys', row.keys));
      legend.append(line);
    }
    root.append(legend);
  } else {
    const qrWrap = el('div', 'qr');
    qrCanvas = el('canvas');
    qrWrap.append(qrCanvas);
    urlText = el('div', 'controller-url', controllerBase);
    root.append(qrWrap, urlText);
  }

  const playersHead = el('div', 'players-head');
  const playersTitle = el('span', 'label', 'Players');
  const count = el('span', 'player-count', '0');
  playersHead.append(playersTitle, count);
  const list = el('ul', 'player-list');
  const gameLabel = el('div', 'game-label');
  root.append(playersHead, list, gameLabel);

  const renderRoster = () => {
    const players = [...runtime.players.values()];
    const online = players.filter((p) => p.connected).length;
    count.textContent = online === players.length ? String(players.length) : `${online}/${players.length}`;
    list.replaceChildren(
      ...players.map((p) => {
        const li = el('li', p.connected ? 'player' : 'player away');
        const sw = el('span', 'swatch');
        sw.style.background = p.color;
        li.append(sw, el('span', 'player-name', p.name));
        if (!p.connected) li.append(el('span', 'away-tag', '(away)'));
        return li;
      }),
    );
    if (players.length === 0) list.append(el('li', 'player empty', 'Waiting for players…'));
  };
  const offRoster = runtime.onRosterChange(renderRoster);
  renderRoster();

  let qrToken = 0;
  const lobby: Lobby = {
    setCode(c) {
      if (opts.mock) return;
      code.textContent = c ?? '····';
      if (!qrCanvas || !urlText) return;
      if (!c) {
        qrCanvas.style.visibility = 'hidden';
        urlText.textContent = controllerBase;
        return;
      }
      const url = controllerJoinUrl(controllerBase, c);
      urlText.textContent = url;
      const token = ++qrToken;
      const target = qrCanvas;
      QRCode.toCanvas(target, url, { width: 256, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
        .then(() => {
          if (token === qrToken) target.style.visibility = 'visible';
        })
        .catch((err: unknown) => console.error('[lobby] QR render failed', err));
    },
    setStatus(s) {
      status.className = `status-pill status-${s}`;
      status.textContent = s === 'open' ? 'relay: connected' : s === 'connecting' ? 'relay: connecting…' : s === 'mock' ? 'mock room' : 'relay: offline';
    },
    setGameName(name) {
      gameLabel.textContent = `game: ${name}`;
    },
    destroy() {
      offRoster();
      root.replaceChildren();
    },
  };

  lobby.setGameName(opts.gameName);
  lobby.setStatus(opts.mock ? 'mock' : 'connecting');
  lobby.setCode(undefined);
  return lobby;
}
