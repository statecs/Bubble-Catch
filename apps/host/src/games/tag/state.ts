import type { PlayerId } from '@party/contract';
import type { PowerupKind } from './config';

export interface Ent {
  id: PlayerId;
  x: number;
  y: number;
  /** Last non-zero stick direction, used for dashing while standing still. */
  faceX: number;
  faceY: number;
  /** Onboarding: becomes true the first time the stick moves. */
  hasMoved: boolean;
  /** Present for host-spawned test bots (not real players). */
  bot?: { name: string; color: string; tx: number; ty: number; retargetAt: number };
  ready: boolean;
  infected: boolean;
  /** True for the player picked as "it" at round start. */
  wasIt: boolean;
  /** ms survived this round (set when infected; survivors get the full round). */
  survivedMs: number;
  shield: boolean;
  /** Timestamps (performance.now() ms). 0 = inactive. */
  graceUntil: number;
  immuneUntil: number;
  speedUntil: number;
  frozenUntil: number;
  dashUntil: number;
  dashCooldownUntil: number;
  dashX: number;
  dashY: number;
}

export interface Powerup {
  kind: PowerupKind;
  x: number;
  y: number;
  spawnedAt: number;
}

export interface RankRow {
  id: PlayerId;
  name: string;
  color: string;
  survivedMs: number;
  survived: boolean;
  wasIt: boolean;
}

/** Name/colour/connection for anything on the floor: real players come from ctx.players, bots from the game. */
export interface EntInfo {
  name: string;
  color: string;
  connected: boolean;
}

export type Phase =
  | { kind: 'lobby' }
  | { kind: 'countdown'; endsAt: number }
  | { kind: 'play'; startedAt: number; endsAt: number; itName: string }
  | { kind: 'results'; endsAt: number; ranking: RankRow[]; survivorsWon: boolean };

export function newEnt(id: PlayerId, x: number, y: number): Ent {
  return {
    id,
    x,
    y,
    faceX: 1,
    faceY: 0,
    hasMoved: false,
    ready: false,
    infected: false,
    wasIt: false,
    survivedMs: 0,
    shield: false,
    graceUntil: 0,
    immuneUntil: 0,
    speedUntil: 0,
    frozenUntil: 0,
    dashUntil: 0,
    dashCooldownUntil: 0,
    dashX: 1,
    dashY: 0,
  };
}

/** Reset everything round-specific, keep identity/position. */
export function resetForLobby(e: Ent): void {
  e.ready = false;
  e.infected = false;
  e.wasIt = false;
  e.survivedMs = 0;
  e.shield = false;
  e.graceUntil = e.immuneUntil = e.speedUntil = e.frozenUntil = e.dashUntil = e.dashCooldownUntil = 0;
}
