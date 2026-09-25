import './style.css';
import type { PlayerId, PlayerUi } from '@party/contract';
import { GameRuntime, type RuntimeTransport } from './game/runtime';
import { HostConnection, wireConnectionToRuntime } from './connection';
import { renderLobby } from './lobby';
import { pickGame } from './games';
import { MOCK_LEGEND, startKeyboardMock } from './mock/keyboardPlayers';

const app = document.getElementById('app');
if (!app) throw new Error('#app missing');

const lobbyEl = document.createElement('aside');
lobbyEl.id = 'lobby';
const gameEl = document.createElement('main');
gameEl.id = 'game';
app.replaceChildren(lobbyEl, gameEl);

const isMock = new URLSearchParams(location.search).get('mock') === '1';
const game = pickGame();

if (isMock) {
  const transport: RuntimeTransport = {
    sendToPlayer: (playerId: PlayerId, ui: PlayerUi) => console.log('[mock] sendToPlayer', playerId, ui),
    sendToAll: (ui: PlayerUi) => console.log('[mock] sendToAll', ui),
  };
  const runtime = new GameRuntime(gameEl, transport);
  renderLobby(lobbyEl, runtime, { gameName: game.name, mock: { legend: MOCK_LEGEND } });
  runtime.mount(game);
  startKeyboardMock(runtime);
} else {
  const conn = new HostConnection();
  const runtime = new GameRuntime(gameEl, conn);
  wireConnectionToRuntime(conn, runtime);
  const lobby = renderLobby(lobbyEl, runtime, { gameName: game.name });
  lobby.setStatus(conn.getStatus());
  lobby.setCode(conn.roomCode);
  conn.onStatus((s) => lobby.setStatus(s));
  conn.onMessage((m) => {
    if (m.type === 'room_created') lobby.setCode(m.code);
  });
  runtime.mount(game);
}
