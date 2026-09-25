# Brief: Scaffold a party-game platform repo (architecture only)

## Context
We are a team of 3 at a time-boxed build day (~2 hours total). We want to build a
browser-based party game where an audience joins from their phones using a join
code shown on a big screen (like Kahoot / Jackbox). Phones act as controllers
(e.g. a virtual joystick); the big screen renders the shared game world.

We have NOT decided on the game yet. Your job is the platform underneath it.

You are the architect. Your role is to make the decisions that let three people,
each with their own Claude instance, work in parallel without stepping on each
other.

## Outcome
A working monorepo that provides:
- A realtime relay server with rooms and join codes
- A host (big screen) app with a lobby: join code, QR code, list of joined players
- A controller (phone) app: join by code + name, then a generic input surface
- A shared, typed message contract used by all three
- A pluggable "game module" interface on the host side, with one trivial
  placeholder game (e.g. each player is a dot moved by their joystick) that
  proves the loop end to end
- Docs that other Claude instances will read before working in the repo

Do NOT build any real game logic. Stop at the placeholder.

## Why it matters
After the scaffold, three people split into independent workstreams: server and
joining, host game and rendering, and possibly a map/world pipeline. If the
contract and boundaries are clear, each person can build and test alone against
mocks and integrate in one step. If they aren't, we lose the day to integration.
The scaffold's real product is *parallelisability*.

## What observable success looks like
- One command from the repo root starts everything locally
- Opening the host app shows a join code and a QR code
- Two real phones on mobile data (via a tunnel such as cloudflared or ngrok)
  can join, appear in the lobby, and move their dot on the host screen
- A phone that disconnects and rejoins keeps its identity
- Each app can run in isolation against a mock of its counterpart (e.g. a fake
  host that logs inputs, a fake controller the host can be driven with via keyboard)
- Swapping the placeholder game for another game module requires no changes to
  the server or the controller
- A new Claude instance can read the docs and know exactly what it may change,
  what it must not change, and how to test its slice

## Constraints that must remain true
- TypeScript throughout, strict mode. Vite for the two client apps.
- The server is a dumb relay: rooms, join codes, player identity, message
  forwarding. It contains NO game logic.
- The host browser is authoritative for game state.
- The message contract lives in one shared package and is the single source of
  truth. No app defines its own message shapes.
- Controllers send input only. They never simulate or render the world.
- The controller input model is generic, not game-specific (e.g. an analog
  vector plus a small number of buttons), so the game choice stays open.
- No database, no auth, no accounts. In-memory state is fine.
- Minimal dependencies. Prefer boring, well-known libraries over frameworks
  that need learning time.
- Must work on current mobile Safari and Chrome, including reconnection when
  a phone sleeps.
- Time box: the scaffold should be usable within ~20–30 minutes. Favour
  working and clear over complete.

## Docs to produce (for other Claude instances)
At minimum:
- A root-level orientation doc (e.g. CLAUDE.md) covering what this is, how to run
  it, repo map, the golden rules above, and how to test in isolation
- The message contract, explained in words alongside the types
- The game module interface: what a game must implement and what it receives
- Workstream boundaries: which folders each track owns, and the rule for
  changing shared things (contract changes are announced to the team, never
  made silently)

Keep the docs short and scannable. They're read by models under time pressure.

## How to work
- You decide the structure, libraries and sequencing within these constraints.
  State your key decisions and trade-offs briefly in the docs.
- You may delegate well-bounded pieces to other models (e.g. the controller
  UI or host lobby UI to Opus or Sonnet) while you own the architecture, the
  contract and the docs. Review what you delegate against the constraints
  before accepting it.
- If a constraint blocks something important, flag it rather than quietly
  working around it.

## Definition of finished
The success criteria above are demonstrably met, the docs exist, and you have
given a short summary covering: how to run it, the decisions you made, and
anything you deliberately left out.