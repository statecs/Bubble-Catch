import type { GameModule } from '../game/GameModule';
import { DotsGame } from './dots';
import { MeadowGame } from './meadow';
import { TagGame } from './tag';
import { PaintGame } from './paint';
import tagPreview from './tag/preview.jpg';
import meadowPreview from './meadow/preview.jpg';
import paintPreview from './paint/preview.jpg';
import dotsPreview from './dots/preview.jpg';

export const GAMES: Record<string, GameModule> = {
  dots: DotsGame,
  meadow: MeadowGame,
  tag: TagGame,
  paint: PaintGame,
};

/** What the host's game picker shows for each game, in picker order. */
export interface GameCard {
  id: string;
  name: string;
  /** One line: what you do and how you win. */
  blurb: string;
  preview: string;
}

export const GAME_CARDS: readonly GameCard[] = [
  { id: 'tag', name: 'Tag / Infection', blurb: 'One player is IT and infects everyone they touch. Survive 90 s to win.', preview: tagPreview },
  { id: 'meadow', name: 'Meadow', blurb: 'Be a cute animal. Collect the most bubbles, leaves, berries and flowers in 60 s.', preview: meadowPreview },
  { id: 'paint', name: 'Paint to Conquer', blurb: 'Be a goo blob that paints the floor. Own the most floor when time runs out.', preview: paintPreview },
  { id: 'dots', name: 'Dots', blurb: 'The tiny demo: move a dot around. Handy for checking phones work.', preview: dotsPreview },
];

/** The game named by `?game=<id>`, or null if there's none (or it's unknown) so the host shows the picker. */
export function gameFromUrl(): string | null {
  const id = new URLSearchParams(location.search).get('game');
  if (!id) return null;
  if (GAMES[id]) return id;
  console.warn(`[host] unknown game "${id}". Known: ${Object.keys(GAMES).join(', ')}`);
  return null;
}
