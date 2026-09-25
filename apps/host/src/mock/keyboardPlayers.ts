/**
 * Keyboard mock: a fake room so the host can be developed without a relay.
 * Feeds the runtime through the exact same methods the real connection uses.
 *
 *   Player 1 "WASD":   W A S D move, Space = A, Shift = B
 *   Player 2 "Arrows": arrow keys move, Enter = A, / = B
 *   P toggles player 2 connected / away.
 */
import { PLAYER_COLORS, type InputState, type Player } from '@party/contract';
import type { GameRuntime } from '../game/runtime';

interface KeyMap {
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  a: string[];
  b: string[];
}

interface MockPlayer {
  player: Player;
  keys: KeyMap;
}

const MOCK_PLAYERS: MockPlayer[] = [
  {
    player: { id: 'mock-player-wasd', name: 'WASD', color: PLAYER_COLORS[0], connected: true },
    keys: {
      up: ['KeyW'],
      down: ['KeyS'],
      left: ['KeyA'],
      right: ['KeyD'],
      a: ['Space'],
      b: ['ShiftLeft', 'ShiftRight'],
    },
  },
  {
    player: { id: 'mock-player-arrows', name: 'Arrows', color: PLAYER_COLORS[1], connected: true },
    keys: {
      up: ['ArrowUp'],
      down: ['ArrowDown'],
      left: ['ArrowLeft'],
      right: ['ArrowRight'],
      a: ['Enter', 'NumpadEnter'],
      b: ['Slash', 'NumpadDivide'],
    },
  },
];

export const MOCK_LEGEND: ReadonlyArray<{ name: string; keys: string }> = [
  { name: 'WASD', keys: 'WASD move · Space A · Shift B' },
  { name: 'Arrows', keys: 'Arrows move · Enter A · / B' },
  { name: 'P', keys: 'toggle Arrows away' },
];

const HANDLED = new Set(MOCK_PLAYERS.flatMap((m) => Object.values(m.keys).flat()));

function computeInput(keys: KeyMap, down: ReadonlySet<string>): InputState {
  const any = (codes: string[]) => codes.some((c) => down.has(c));
  let x = (any(keys.right) ? 1 : 0) - (any(keys.left) ? 1 : 0);
  let y = (any(keys.down) ? 1 : 0) - (any(keys.up) ? 1 : 0);
  const mag = Math.hypot(x, y);
  if (mag > 1) {
    x /= mag;
    y /= mag;
  }
  return { axis: { x, y }, buttons: { a: any(keys.a), b: any(keys.b) } };
}

export function startKeyboardMock(runtime: GameRuntime): () => void {
  const down = new Set<string>();
  const p2 = MOCK_PLAYERS[1]!.player;
  let p2Connected = true;

  for (const m of MOCK_PLAYERS) runtime.playerJoined({ ...m.player });

  const push = () => {
    const t = Date.now();
    for (const m of MOCK_PLAYERS) runtime.input(m.player.id, computeInput(m.keys, down), t);
  };

  const isTyping = (e: KeyboardEvent) =>
    e.target instanceof HTMLElement && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));

  const onKeyDown = (e: KeyboardEvent) => {
    if (isTyping(e)) return;
    if (e.code === 'KeyP' && !e.repeat) {
      p2Connected = !p2Connected;
      runtime.playerConnection(p2.id, p2Connected);
      return;
    }
    if (!HANDLED.has(e.code)) return;
    e.preventDefault();
    if (down.has(e.code)) return;
    down.add(e.code);
    push();
  };
  const onKeyUp = (e: KeyboardEvent) => {
    if (!down.delete(e.code)) return;
    e.preventDefault();
    push();
  };
  const onBlur = () => {
    if (down.size === 0) return;
    down.clear();
    push();
  };

  window.addEventListener('keydown', onKeyDown);
  window.addEventListener('keyup', onKeyUp);
  window.addEventListener('blur', onBlur);

  return () => {
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('keyup', onKeyUp);
    window.removeEventListener('blur', onBlur);
    for (const m of MOCK_PLAYERS) runtime.playerLeft(m.player.id);
  };
}
