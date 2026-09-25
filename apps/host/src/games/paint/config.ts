/** Tunables for Paint to Conquer. CSS px and ms. */
export const CFG = {
  radius: 20,
  speed: 240,
  minPlayers: 2,
  countdownMs: 4000,
  roundMs: 60_000,
  resultsMs: 9000,
  /** Trail brush: a blob is stamped every `stepPx` of travel. */
  brush: { radius: 24, stepPx: 7 },
  /** A = splat: a burst of paint around you. */
  splat: { radius: 90, cooldownMs: 4000, blobs: 12 },
  /** B = dash: faster, wider trail. */
  dash: { speedMult: 2.4, durationMs: 200, cooldownMs: 2500, brushMult: 1.6 },
  /** Paint bombs on the floor: pick one up for a huge splat. */
  bomb: { spawnEveryMs: 6000, max: 3, radius: 15, splatRadius: 140, minPlayerDistance: 80 },
  /** Ownership grid cell size for scoring. */
  gridPx: 8,
  coverageEveryMs: 200,
  bot: { speedMult: 0.8, retargetMs: 1200 },
  /** Chance per trail stamp to spawn a drip. */
  dripChance: 0.06,
} as const;

/** World of Goo-ish palette: dark inky floor, saturated goo. */
export const ART = {
  floor: '#1b1a17',
  floorLight: '#2a2822',
  ink: '#0e0d0b',
  paper: 'rgba(255, 244, 214, 0.9)',
  paperDim: 'rgba(255, 244, 214, 0.55)',
  accent: '#f5c451',
  /** Chunky hand-drawn feel. Falls back gracefully. */
  font: "'Chalkboard SE', 'Comic Sans MS', 'Segoe Print', 'Bradley Hand', cursive",
} as const;
