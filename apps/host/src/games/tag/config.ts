/** Tunables for Tag / Infection. Everything is in CSS px and ms. */
export const CFG = {
  radius: 18,
  speed: 260,
  infectedSpeedMult: 1.12,
  minPlayers: 2,
  countdownMs: 5000,
  roundMs: 90_000,
  resultsMs: 8000,
  /** A freshly infected player can't infect for this long (no instant chain reactions). */
  infectGraceMs: 800,
  /** After a shield absorbs a tag the player is untouchable briefly so they can get away. */
  shieldEscapeMs: 700,
  /** How long the "X is IT" banner shows after the round starts. */
  revealMs: 2500,
  bot: { speedMult: 0.75, retargetMs: 1500, fleeDistance: 220 },
  dash: { speedMult: 2.6, durationMs: 180, cooldownMs: 2500 },
  powerup: {
    radius: 13,
    spawnEveryMs: 5000,
    max: 5,
    speedMs: 4000,
    speedMult: 1.6,
    freezeMs: 2000,
    /** Don't spawn closer than this to any player. */
    minPlayerDistance: 90,
  },
} as const;

export const INFECTED_COLOR = '#4ade80';

export type PowerupKind = 'speed' | 'shield' | 'freeze';

export const POWERUPS: Record<PowerupKind, { color: string; glyph: string; label: string }> = {
  speed: { color: '#facc15', glyph: '⚡', label: 'Speed!' },
  shield: { color: '#22d3ee', glyph: '🛡', label: 'Shield!' },
  freeze: { color: '#93c5fd', glyph: '❄', label: 'Freeze!' },
};
