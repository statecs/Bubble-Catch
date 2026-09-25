/**
 * HostConnection: the host's link to the relay. The relay is a dumb pipe; this
 * class only speaks the contract and never holds game state.
 */
import {
  ReconnectingSocket,
  ServerToHost,
  defaultWsUrl,
  type HostToServer,
  type JoinCode,
  type PlayerId,
  type PlayerUi,
  type SocketStatus,
} from '@party/contract';
import type { GameRuntime, RuntimeTransport } from './game/runtime';

const ROOM_KEY = 'party.hostRoom';

function readStoredCode(): JoinCode | undefined {
  try {
    return sessionStorage.getItem(ROOM_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

function storeCode(code: JoinCode): void {
  try {
    sessionStorage.setItem(ROOM_KEY, code);
  } catch {
    /* storage unavailable: reclaim just won't survive a reload */
  }
}

export class HostConnection implements RuntimeTransport {
  private readonly socket: ReconnectingSocket<HostToServer, ServerToHost>;
  private code: JoinCode | undefined = readStoredCode();

  constructor(url: string = defaultWsUrl(import.meta.env.VITE_WS_URL)) {
    this.socket = new ReconnectingSocket<HostToServer, ServerToHost>(url, ServerToHost);
    // Fires on EVERY (re)connect: reclaim the room we hold, if any.
    this.socket.onOpen(() => {
      this.socket.send(this.code ? { type: 'create_room', code: this.code } : { type: 'create_room' });
    });
    this.socket.onMessage((m) => {
      if (m.type === 'room_created') {
        this.code = m.code;
        storeCode(m.code);
      } else if (m.type === 'error') {
        console.warn('[host] server error:', m.message);
      }
    });
  }

  /** Current room code, once the server has assigned / confirmed one. */
  get roomCode(): JoinCode | undefined {
    return this.code;
  }

  getStatus(): SocketStatus {
    return this.socket.getStatus();
  }

  onMessage(cb: (m: ServerToHost) => void): () => void {
    return this.socket.onMessage(cb);
  }

  onStatus(cb: (s: SocketStatus) => void): () => void {
    return this.socket.onStatus(cb);
  }

  sendToPlayer(playerId: PlayerId, ui: PlayerUi): void {
    this.socket.send({ type: 'to_player', playerId, ui });
  }

  sendToAll(ui: PlayerUi): void {
    this.socket.send({ type: 'to_all', ui });
  }

  kick(playerId: PlayerId): void {
    this.socket.send({ type: 'kick', playerId });
  }

  close(): void {
    this.socket.close();
  }
}

/** Feed relay events into the runtime. Returns an unsubscribe function. */
export function wireConnectionToRuntime(conn: HostConnection, runtime: GameRuntime): () => void {
  return conn.onMessage((m) => {
    switch (m.type) {
      case 'room_created':
        runtime.setRoster(m.players);
        break;
      case 'player_joined':
        runtime.playerJoined(m.player);
        break;
      case 'player_left':
        runtime.playerLeft(m.playerId);
        break;
      case 'player_reconnected':
        runtime.playerConnection(m.playerId, true);
        break;
      case 'player_disconnected':
        runtime.playerConnection(m.playerId, false);
        break;
      case 'input':
        runtime.input(m.playerId, m.input, m.t);
        break;
      case 'error':
        break;
    }
  });
}
