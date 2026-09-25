import type { PlayerId } from '@party/contract';

export interface Goo {
  id: PlayerId;
  /** 1-based paint owner index; 0 means unpainted. Stable for the life of the goo. */
  owner: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  faceX: number;
  faceY: number;
  /** Per-goo wobble phase so blobs don't jiggle in sync. */
  seed: number;
  hasMoved: boolean;
  ready: boolean;
  bot?: { name: string; color: string; tx: number; ty: number; retargetAt: number };
  /** Distance travelled since last trail stamp. */
  sinceStamp: number;
  splatCooldownUntil: number;
  dashUntil: number;
  dashCooldownUntil: number;
  dashX: number;
  dashY: number;
  /** Squash impulse (0..1) that decays; set on splat / bomb. */
  squish: number;
}

export interface GooInfo {
  name: string;
  color: string;
  connected: boolean;
}

export interface Bomb {
  x: number;
  y: number;
  spawnedAt: number;
}

export interface SplatFx {
  x: number;
  y: number;
  color: string;
  start: number;
  radius: number;
}

export interface Drip {
  x: number;
  y: number;
  color: string;
  owner: number;
  start: number;
  length: number;
  width: number;
}

export interface Score {
  id: PlayerId;
  name: string;
  color: string;
  share: number; // 0..1
}

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'countdown'; endsAt: number }
  | { kind: 'play'; startedAt: number; endsAt: number }
  | { kind: 'results'; endsAt: number; startedAt: number; scores: Score[] };

let ownerSeq = 0;
export function newGoo(id: PlayerId, x: number, y: number): Goo {
  return {
    id,
    owner: ++ownerSeq,
    x,
    y,
    vx: 0,
    vy: 0,
    faceX: 1,
    faceY: 0,
    seed: Math.random() * 1000,
    hasMoved: false,
    ready: false,
    sinceStamp: 0,
    splatCooldownUntil: 0,
    dashUntil: 0,
    dashCooldownUntil: 0,
    dashX: 1,
    dashY: 0,
    squish: 0,
  };
}

export function resetForLobby(g: Goo): void {
  g.ready = false;
  g.splatCooldownUntil = g.dashUntil = g.dashCooldownUntil = 0;
  g.vx = g.vy = 0;
  g.squish = 0;
}
