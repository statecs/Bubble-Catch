# Party platform — read this first

Browser party game platform. Phones are controllers (joystick + 2 buttons), a big screen
("host") renders the shared world, a tiny relay server forwards messages. This repo is the
platform plus four game modules in `apps/host/src/games/`: **tag** (Tag / Infection),
**meadow** (animals collecting items), **paint** (Paint to Conquer) and **dots** (minimal demo).
Tag, Meadow and Paint each have a README in their folder. The host opens on a game picker
(`apps/host/src/picker.ts`); `?game=<id>` skips it.

## Run it

```bash
npm install
npm run dev          # relay :8787, host http://localhost:5173/, controller http://localhost:5174/
```
Open the host URL on the laptop; scan the QR with a phone on the same Wi-Fi.

**Phones on mobile data (tunnel):**
```bash
npm run build && npm start        # relay serves controller at :8787/  and host at :8787/host/
npm run tunnel                    # ngrok -> https://xxx.ngrok.app  (phones open it, laptop opens /host/)
```
Or in dev: `npm run tunnel:dev` (tunnels the controller dev server, 5174, which proxies /ws), then open
the host with `?controller=https://xxx.ngrok.app/` once so the QR points at the tunnel (it's remembered).

Useful URLs / flags:
- host `?mock=1` — no server; two keyboard players (WASD / arrows). `?game=<id>` picks a game module
  (without it the host shows the game picker).
- controller `?mock=1` — no server; shows the pad and logs what it would send. `?code=ABCD` prefills.
- `npm run fake:host` / `npm run fake:controller -- ABCD Alice` — relay-level fakes, see docs/TESTING.md.

## Repo map

```
packages/contract/   THE message contract (zod schemas -> TS types) + ReconnectingSocket. Shared by all.
packages/world/      @party/world: hand-drawn art (animals, collectibles, ink, palette, scene). Used by meadow.
apps/server/         Relay: rooms, join codes, player identity, forwarding. ZERO game logic. + fake scripts.
apps/host/           Big screen. src/game/ = module seam (frozen). src/games/<id>/ = game modules.
apps/controller/     Phone. Join screen + generic pad (joystick, A, B). Sends input only.
docs/                CONTRACT.md  GAME_MODULE.md  WORKSTREAMS.md  TESTING.md
```

## Golden rules (violating these costs the team the day)

1. **The contract is the only source of message shapes.** Import from `@party/contract`. Never define
   a message type in an app. Changing the contract = tell the whole team first, then bump nothing
   silently (see docs/CONTRACT.md).
2. **The server is a dumb relay.** It never reads `input.axis`, never knows what a game is.
3. **The host browser is authoritative** for all game state.
4. **Controllers send input only.** They never render or simulate the world. The only host→phone
   data is `PlayerUi` (colour / short text / vibrate).
5. **Input is generic**: analog vector + buttons `a`,`b`. Games adapt to the pad, not the reverse.
6. **Games are modules** under `apps/host/src/games/<id>/` implementing `GameModule`. Swapping a game
   touches no server or controller code. Don't edit `apps/host/src/game/*` (the seam).
7. TypeScript strict everywhere. Minimal deps. No DB, no auth.
8. Stay in your lane (docs/WORKSTREAMS.md). Shared folders are changed by announcement, not surprise.

## Before you claim done
`npm run typecheck` and `npm run build` pass, and you tested your slice in isolation (docs/TESTING.md).

## Key decisions (short)
- **Native WebSocket + `ws`**, not socket.io: pure JSON frames, any WS client can mock either side,
  ~150 lines of reconnect logic in `packages/contract/src/socket.ts` handles phone sleep.
- **zod schemas as the contract**: runtime validation at the relay and in every client for free;
  types inferred, so there's exactly one definition.
- **Vanilla TS + Canvas**: nothing to learn; a game module gets a bare container and may bring
  Pixi/Phaser later inside its own folder.
- **Identity = `playerId` in the phone's localStorage.** Re-sent on every (re)connect; the server maps
  it back to the same player. Host reload reclaims its room via `sessionStorage` (60 s grace).
- **One port in prod**: relay serves the built apps, so one tunnel covers phones and screen.
- **npm workspaces + concurrently**: no extra tooling to install.
