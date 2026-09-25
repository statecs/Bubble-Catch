import {
  ReconnectingSocket,
  ServerToController,
  defaultWsUrl,
  type ControllerToServer,
  type InputState,
  type JoinCode,
  type JoinErrorReason,
  type Player,
  type PlayerUi,
  type SocketStatus,
} from '@party/contract';
import { getPlayerId } from './identity';

export interface ConnectionEvents {
  joined?: (player: Player, code: JoinCode) => void;
  joinError?: (reason: JoinErrorReason) => void;
  ui?: (ui: PlayerUi) => void;
  kicked?: () => void;
  roomClosed?: () => void;
  status?: (status: SocketStatus) => void;
}

/**
 * Controller side of the relay. Keeps the join intent and re-sends it on every
 * socket open so a phone that slept comes back as the same player.
 */
export class ControllerConnection {
  private socket: ReconnectingSocket<ControllerToServer, ServerToController> | null = null;
  /** Non-null while a join is pending or active. */
  private session: { code: JoinCode; name: string } | null = null;
  private joined = false;

  constructor(private readonly events: ConnectionEvents = {}) {}

  get isJoined(): boolean {
    return this.joined;
  }

  getStatus(): SocketStatus {
    return this.socket?.getStatus() ?? 'closed';
  }

  join(code: JoinCode, name: string): void {
    this.session = { code, name };
    this.joined = false;
    const s = this.ensureSocket();
    if (s.getStatus() === 'open') this.sendJoin();
    // otherwise onOpen will send it
  }

  sendInput(input: InputState): boolean {
    if (!this.joined || !this.socket) return false;
    return this.socket.send({ type: 'input', input });
  }

  leave(): void {
    if (this.socket && this.session) this.socket.send({ type: 'leave' });
    this.session = null;
    this.joined = false;
  }

  private ensureSocket(): ReconnectingSocket<ControllerToServer, ServerToController> {
    if (this.socket) return this.socket;
    const s = new ReconnectingSocket<ControllerToServer, ServerToController>(
      defaultWsUrl(import.meta.env.VITE_WS_URL as string | undefined),
      ServerToController,
    );
    s.onStatus((st) => this.events.status?.(st));
    s.onOpen(() => this.sendJoin());
    s.onMessage((m) => this.handle(m));
    this.socket = s;
    this.events.status?.(s.getStatus());
    return s;
  }

  private sendJoin(): void {
    if (!this.session || !this.socket) return;
    this.socket.send({ type: 'join', code: this.session.code, playerId: getPlayerId(), name: this.session.name });
  }

  private handle(m: ServerToController): void {
    switch (m.type) {
      case 'joined':
        if (!this.session) return; // left meanwhile
        this.joined = true;
        this.session.code = m.code;
        this.events.joined?.(m.player, m.code);
        break;
      case 'join_error':
        this.session = null;
        this.joined = false;
        this.events.joinError?.(m.reason);
        break;
      case 'ui':
        this.events.ui?.(m.ui);
        break;
      case 'kicked':
        this.session = null;
        this.joined = false;
        this.events.kicked?.();
        break;
      case 'room_closed':
        this.session = null;
        this.joined = false;
        this.events.roomClosed?.();
        break;
      case 'error':
        console.warn('[controller] server error:', m.message);
        break;
    }
  }
}
