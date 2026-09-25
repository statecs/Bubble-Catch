# Meadow

`?game=meadow`. Every player is a hand-drawn animal in a pastel meadow. Bubbles, leaves, berries and
flowers keep popping up; walk into them to collect them. Most items when the clock runs out wins.

All art (animals, collectibles, the paper-and-ink look, the meadow background) comes from the shared
[`@party/world`](../../../../../packages/world/src) package.

## Controls (phone)

| Input    | Lobby                         | During a round                     |
|----------|-------------------------------|------------------------------------|
| Joystick | walk (and collect, for fun)   | walk                               |
| **A**    | hop **and** toggle ready      | hop                                |
| **B**    | dash                          | dash: 2.4× speed burst (0.8 s cooldown) |

Everything is worth **1 point**: 🫧 bubble, 🍃 leaf, 🍓 berry, 🌸 flower. Bubbles drift around, so
they're harder to catch.

## Your animal

The first eight players each get a different animal: cat, frog, fox, bunny, duck, pig, penguin and
bear. Player nine gets a second cat with a body tinted in their own colour, and so on. Your phone
tells you which animal you are when you join.

## How a round goes

1. **Lobby.** Everyone walks around and can collect items for fun (these don't count). The big screen
   shows a drawn "YOUR PHONE" card, and each animal wears a badge: "move the stick" → "press A when
   ready" → "✓ READY". When every connected human is ready (min. 2 players, bots count toward the
   2), the round starts on its own.
2. **Countdown (5 s).** Scores reset, everyone is respawned and frozen, and a rules card is shown.
3. **Round (60 s).** Collect as much as you can. The timer turns red in the last 10 seconds and the
   current leader is shown under it. More items spawn the more players there are.
4. **Results (8 s).** A ranking card (name, animal, score) on the big screen and your place on your
   phone, then back to the lobby. Ties are shown as a tie.

**Joining mid-round:** you jump straight in and can start collecting.

## Host controls

Buttons top-right, or keys: **G** start now (skips ready-up), **Esc** pause / resume, **R** reset to
the lobby, **+ / −** add or remove a test bot. Each bot heads for the nearest item no other bot is
after, and moves a bit slower than a player so humans can win.

## Tuning

The numbers above are constants at the top of [`index.ts`](index.ts) (`ROUND_TIME`, `SPEED`,
`DASH_*`, `SPAWN_EVERY`, `BOT_SPEED`, …).

## Files

- `index.ts`: the `GameModule`: phases, movement, collecting, bots, host panel, phone hints.
- `hud.ts`: overlays: lobby title and phone card, countdown rules, round timer, results, pause.
- Art: `packages/world/src/` (`animals.ts`, `collectibles.ts`, `scene.ts`, `ink.ts`, `palette.ts`).

## Test it alone

`npm run dev`, then open `http://localhost:5173/?mock=1&game=meadow`: two keyboard players,
WASD + Space (A) / Shift (B), and arrows + Enter (A) / `/` (B). Add bots with **+**.
