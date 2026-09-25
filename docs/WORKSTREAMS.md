# Workstreams and ownership

Three tracks, three branches, one integration step. Branch from `main` after the scaffold commit.

| Track | Branch | Owns (may edit freely) | Tests alone with |
|---|---|---|---|
| **A: server & joining** | `track/server` | `apps/server/**`, `apps/controller/**` | `fake:host`, controller `?mock=1`, `fake:controller` |
| **B: host game & rendering** | `track/host-game` | `apps/host/src/games/**`, `apps/host/src/lobby.ts`, `apps/host/src/style.css`, `apps/host/index.html` | host `?mock=1`, `fake:controller` |
| **C: map / world pipeline** | `track/world` | `packages/world/**` (create it), and a game under `apps/host/src/games/<id>/` that consumes it | host `?mock=1&game=<id>` |

## Shared / frozen (change only by announcement, then in one PR that fixes every consumer)
- `packages/contract/**` — the message contract. See docs/CONTRACT.md "Changing the contract".
- `apps/host/src/game/GameModule.ts`, `apps/host/src/game/runtime.ts` — the game seam.
- `apps/host/src/connection.ts`, `apps/host/src/main.ts`, `apps/controller/src/connection.ts` — wiring.
- Root `package.json`, `tsconfig.base.json`, both `vite.config.ts`, and the docs.

"By announcement" = post in the team channel *what* and *why* before editing; the other two ack; you make
the change and run `npm run typecheck` at root so all consumers are fixed in the same commit.

## Suggested first tasks per track
- **A**: lobby-related niceties in the relay (max players, name rules), controller UX (haptics, landscape
  lock, "away" handling), a stress fake that runs N controllers, tunnel scripts.
- **B**: the real game module: world, collisions, scoring, phases (lobby → play → results) inside the
  module. If you need a phase/state message the *controller* should react to, that's a `PlayerUi`
  extension → announce a contract change.
- **C**: map format, loader, renderer helper (tile/vector), exported from `packages/world` for B to use.

## Integration
Merge order: `track/server` → `track/host-game` → `track/world`. Each merge: `npm run typecheck && npm run
build`, then the real-phones smoke test from CLAUDE.md. Keep PRs small; rebase often.
