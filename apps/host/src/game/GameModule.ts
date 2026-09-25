/**
 * The game module interface. A game is a plain object implementing GameModule.
 * The host runtime mounts it, hands it a container element and live player /
 * input maps, and forwards events. The game owns its own render loop.
 *
 * Rules (see docs/GAME_MODULE.md):
 *  - Games live in apps/host/src/games/<id>/ and register in games/index.ts.
 *  - Games never touch the WebSocket. Everything they need is on GameContext.
 *  - Games never change this file or the contract. Ask the team if you must.
 */
import type { InputState, Player, PlayerId, PlayerUi } from '@party/contract';

export interface GameContext {
  /** Element the game owns exclusively. Fills the game area; resize-observe it if you need to. */
  container: HTMLElement;
  /** Live, read-only view of everyone in the room (connected or not). Updated by the runtime. */
  players: ReadonlyMap<PlayerId, Player>;
  /** Latest full input state per player. Players who never sent input are absent; treat as ZERO_INPUT. */
  inputs: ReadonlyMap<PlayerId, InputState>;
  /** Push a small generic hint to one phone (colour / short text / vibrate ms). */
  sendToPlayer(playerId: PlayerId, ui: PlayerUi): void;
  /** Same, to every connected phone. */
  sendToAll(ui: PlayerUi): void;
}

export interface GameModule {
  /** Stable id, used in `?game=<id>` and the registry. */
  id: string;
  name: string;

  /** Called once. Set up DOM/canvas inside ctx.container and start your loop. */
  mount(ctx: GameContext): void;
  /** Called once. Stop loops, remove listeners, clear ctx.container. */
  unmount(): void;

  /** A new identity entered the room. */
  onPlayerJoin?(player: Player): void;
  /** Identity removed for good (kicked / left). */
  onPlayerLeave?(player: Player): void;
  /** `player.connected` flipped (phone slept / woke). Identity persists. */
  onPlayerConnection?(player: Player): void;
  /** Optional push notification of inputs. Most games just poll ctx.inputs in their loop. */
  onInput?(playerId: PlayerId, input: InputState, t: number): void;
}
