import type { GameModule } from '../game/GameModule';
import { DotsGame } from './dots';

export const GAMES: Record<string, GameModule> = {
  dots: DotsGame,
};

export const DEFAULT_GAME = 'dots';

/** Pick the game from `?game=<id>`, falling back to the default. */
export function pickGame(): GameModule {
  const id = new URLSearchParams(location.search).get('game');
  if (id) {
    const g = GAMES[id];
    if (g) return g;
    console.warn(`[host] unknown game "${id}", using "${DEFAULT_GAME}". Known: ${Object.keys(GAMES).join(', ')}`);
  }
  return GAMES[DEFAULT_GAME]!;
}
