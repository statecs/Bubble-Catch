import './style.css';
import type { PlayerId, PlayerUi } from '@party/contract';
import { GameRuntime, type RuntimeTransport } from './game/runtime';
import { HostConnection, wireConnectionToRuntime } from './connection';
import { renderLobby, type Lobby } from './lobby';
import { GAMES, gameFromUrl } from './games';
import { renderPicker, type Picker } from './picker';
import { MOCK_LEGEND, startKeyboardMock } from './mock/keyboardPlayers';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const lobbyEl = document.createElement('aside');
lobbyEl.id = 'lobby';
const gameEl = document.createElement('main');
gameEl.id = 'game';
app.replaceChildren(lobbyEl, gameEl);

const isMock = new URLSearchParams(location.search).get('mock') === '1';

let runtime: GameRuntime;
let transport: RuntimeTransport;
let lobby: Lobby;

if (isMock) {
  transport = {
    sendToPlayer: (playerId: PlayerId, ui: PlayerUi) => console.log('[mock] sendToPlayer', playerId, ui),
    sendToAll: (ui: PlayerUi) => console.log('[mock] sendToAll', ui),
  };
  runtime = new GameRuntime(gameEl, transport);
  lobby = renderLobby(lobbyEl, runtime, { gameName: null, onChangeGame: showPicker, mock: { legend: MOCK_LEGEND } });
  startKeyboardMock(runtime);
} else {
  const conn = new HostConnection();
  transport = conn;
  runtime = new GameRuntime(gameEl, conn);
  wireConnectionToRuntime(conn, runtime);
  const l = renderLobby(lobbyEl, runtime, { gameName: null, onChangeGame: showPicker });
  lobby = l;
  l.setStatus(conn.getStatus());
  l.setCode(conn.roomCode);
  conn.onStatus((s) => l.setStatus(s));
  conn.onMessage((m) => {
    if (m.type === 'room_created') l.setCode(m.code);
  });
}

// ---------- game picker ----------
// No `?game=` → show the picker; the room is already open, so players can join while the host
// chooses. Picking writes `?game=<id>` into the URL so a host reload goes straight back to that game.

const PICKING_HINT: PlayerUi = { text: 'Host is picking a game…' };
let picker: Picker | null = null;
let offPickerRoster: (() => void) | null = null;

function play(id: string): void {
  const game = GAMES[id];
  if (!game) return;
  picker?.destroy();
  picker = null;
  offPickerRoster?.();
  offPickerRoster = null;
  setUrlGame(id);
  lobby.setGameName(game.name);
  runtime.mount(game);
}

function showPicker(): void {
  runtime.unmount();
  setUrlGame(null);
  lobby.setGameName(null);
  const p = renderPicker(gameEl, play);
  picker = p;
  const seen = new Set(runtime.players.keys());
  const update = () => {
    p.setPlayerCount([...runtime.players.values()].filter((pl) => pl.connected).length);
    // Tell newcomers what's going on; games send their own hints once one is picked.
    for (const id of runtime.players.keys()) {
      if (!seen.has(id)) {
        seen.add(id);
        transport.sendToPlayer(id, PICKING_HINT);
      }
    }
  };
  offPickerRoster = runtime.onRosterChange(update);
  update();
  transport.sendToAll(PICKING_HINT);
}

function setUrlGame(id: string | null): void {
  const url = new URL(location.href);
  if (id) url.searchParams.set('game', id);
  else url.searchParams.delete('game');
  history.replaceState(null, '', url);
}

const initial = gameFromUrl();
if (initial) play(initial);
else showPicker();
