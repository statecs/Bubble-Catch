# Message contract

Source of truth: `packages/contract/src/messages.ts` (zod schemas; TS types inferred). This page
explains it in words. If they disagree, the code wins and this page is wrong: fix the page.

## Transport
- One WebSocket per client at `/ws`. JSON text frames, one message per frame, `type` discriminator.
- **The first frame decides the role**: `create_room` → this socket is a host; `join` → a controller.
- Server ⇄ browser ping/pong (protocol level) every 15 s; dead sockets are terminated.
- Clients use `ReconnectingSocket` from the contract package. Its `onOpen` fires on **every**
  (re)connect, so clients re-send `create_room` / `join` there. That is the whole reconnection story.

## Identity
- `playerId`: generated once per phone (`crypto.randomUUID()`), kept in localStorage, sent in every
  `join`. Same id ⇒ same player. A new socket with a known id replaces the old one (reconnect).
- `Player = { id, name, color, connected }`. `color` is assigned by the server from `PLAYER_COLORS` in
  join order. `connected` is false while the phone is asleep; identity and roster slot remain.
- Join code: 4 letters from `A-HJ-NP-Z` (no I/O). Case-insensitive on input; canonical uppercase.

## Input model (generic, not game-specific)
```
InputState = { axis: { x: -1..1, y: -1..1 }, buttons: { a: bool, b: bool } }
```
- `x` right, `y` **down** (screen coords). Magnitude ≤ 1.
- Always the full state; no deltas. Controllers send at ≤ 30 Hz (`LIMITS.inputHz`) and only on change,
  plus a final zero state on release. `ZERO_INPUT` is exported for convenience.
- Need another button? Add it to `Buttons` in the contract (announce it), not in an app.

## Messages

Controller → Server
| type | fields | notes |
|---|---|---|
| `join` | `code, playerId, name` | every (re)connect |
| `input` | `input: InputState` | |
| `leave` | | removes the player for good |

Host → Server
| type | fields | notes |
|---|---|---|
| `create_room` | `code?` | pass the old code to reclaim after reload |
| `to_player` | `playerId, ui: PlayerUi` | |
| `to_all` | `ui: PlayerUi` | |
| `kick` | `playerId` | |

Server → Controller
| type | fields |
|---|---|
| `joined` | `code, player` |
| `join_error` | `reason: room_not_found \| name_taken \| room_full \| invalid` |
| `ui` | `ui: PlayerUi` (forwarded from host) |
| `kicked` / `room_closed` | |
| `error` | `message` |

Server → Host
| type | fields | notes |
|---|---|---|
| `room_created` | `code, players[]` | `players` non-empty after a reclaim |
| `player_joined` | `player` | |
| `player_reconnected` / `player_disconnected` | `playerId` | connection flag only |
| `player_left` | `playerId` | gone for good (leave / kick) |
| `input` | `playerId, input, t` | `t` = server receive time (ms) |
| `error` | `message` | |

`PlayerUi = { color?, text? (≤40 chars), vibrate? (ms ≤1000) }` is the **only** thing a host may push
to a phone. It is deliberately tiny: phones show a colour and a label, they never render the world.

## Changing the contract
1. Say so in the team channel *before* editing: what, why, which apps it touches.
2. Edit `messages.ts` only. Update this doc.
3. `npm run typecheck` from root: every consumer breaks loudly in the same commit. Fix them all.
4. Additive changes (new optional field, new message type) are cheap. Renames/removals are not; avoid.
