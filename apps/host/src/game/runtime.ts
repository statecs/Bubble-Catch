/**
 * GameRuntime: the seam between "the room" (real relay OR a keyboard mock) and a GameModule.
 * Both the real connection and the mock feed the same five methods below, so a game can't tell
 * the difference. Owned by architecture; games don't touch it.
 */
import type { InputState, Player, PlayerId, PlayerUi } from '@party/contract';
import type { GameContext, GameModule } from './GameModule';

export interface RuntimeTransport {
  sendToPlayer(playerId: PlayerId, ui: PlayerUi): void;
  sendToAll(ui: PlayerUi): void;
}

export class GameRuntime {
  readonly players = new Map<PlayerId, Player>();
  readonly inputs = new Map<PlayerId, InputState>();
  private game: GameModule | null = null;
  private listeners = new Set<() => void>();

  constructor(
    private readonly container: HTMLElement,
    private readonly transport: RuntimeTransport,
  ) {}

  /** Subscribe to any roster change (join/leave/connection). Used by the lobby UI. */
  onRosterChange(cb: () => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  mount(game: GameModule): void {
    this.unmount();
    this.game = game;
    const ctx: GameContext = {
      container: this.container,
      players: this.players,
      inputs: this.inputs,
      sendToPlayer: (id, ui) => this.transport.sendToPlayer(id, ui),
      sendToAll: (ui) => this.transport.sendToAll(ui),
    };
    game.mount(ctx);
    for (const p of this.players.values()) game.onPlayerJoin?.(p);
  }

  unmount(): void {
    this.game?.unmount();
    this.game = null;
    this.container.replaceChildren();
  }

  get current(): GameModule | null {
    return this.game;
  }

  // ---------- fed by the connection or the mock ----------

  /** Replace the whole roster (room_created after a reclaim). Diffs against the current roster so a mounted game sees join/leave events. */
  setRoster(players: Player[]): void {
    const incoming = new Map(players.map((p) => [p.id, { ...p }] as const));
    for (const [id, p] of this.players) {
      if (!incoming.has(id)) {
        this.players.delete(id);
        this.inputs.delete(id);
        this.game?.onPlayerLeave?.(p);
      }
    }
    for (const [id, p] of incoming) {
      const existing = this.players.get(id);
      if (!existing) {
        this.players.set(id, p);
        this.game?.onPlayerJoin?.(p);
      } else {
        const connChanged = existing.connected !== p.connected;
        Object.assign(existing, p);
        if (connChanged) this.game?.onPlayerConnection?.(existing);
      }
    }
    this.emit();
  }

  playerJoined(player: Player): void {
    const p = { ...player };
    this.players.set(p.id, p);
    this.game?.onPlayerJoin?.(p);
    this.emit();
  }

  playerLeft(playerId: PlayerId): void {
    const p = this.players.get(playerId);
    if (!p) return;
    this.players.delete(playerId);
    this.inputs.delete(playerId);
    this.game?.onPlayerLeave?.(p);
    this.emit();
  }

  playerConnection(playerId: PlayerId, connected: boolean): void {
    const p = this.players.get(playerId);
    if (!p) return;
    p.connected = connected;
    this.game?.onPlayerConnection?.(p);
    this.emit();
  }

  input(playerId: PlayerId, input: InputState, t: number = Date.now()): void {
    if (!this.players.has(playerId)) return;
    this.inputs.set(playerId, input);
    this.game?.onInput?.(playerId, input, t);
  }

  private emit() {
    this.listeners.forEach((cb) => cb());
  }
}
