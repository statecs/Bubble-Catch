# Paint to Conquer

`?game=paint`. Everyone is a goo blob that leaves paint wherever it goes. Paint over other colours
to steal the floor. Whoever owns the most floor when the clock runs out wins.

Art direction borrows from World of Goo: dark inky floor, squishy blobs with big eyes that look
where they're going, squash-and-stretch on movement, blobby paint with drips, hand-lettered text with
ink outlines, wobbly cards. All drawn with Canvas 2D; no assets.

## Controls (phone)

| Input    | Lobby        | During a round                                   |
|----------|--------------|--------------------------------------------------|
| Joystick | move around  | move and paint a trail                           |
| **A**    | toggle ready | **splat**: a burst of paint around you (4 s cooldown) |
| **B**    | dash         | dash: faster and a wider trail (2.5 s cooldown)  |

**Paint bombs** appear on the floor. Run into one for a huge splat in your colour.

## Host controls

Buttons top-right, or keys: **G** start now, **Esc** pause / resume, **R** reset to lobby,
**+ / −** add or remove a test goo (bots head for floor they don't own yet).

## How a round goes

1. **Lobby.** Run around, press **A** to ready. Badges over each goo coach newcomers
   ("move the stick" → "press A" → "ready!"). Starts when every connected human (min. 2 players) is ready.
2. **Countdown (4 s)** with a rules card.
3. **Play (60 s).** A share bar at the top shows who owns what, live.
4. **Results (9 s).** Goo jars fill up to each player's share, winner announced, back to the lobby.

Late joiners just drop in and start painting.

## How scoring works

Paint is drawn to an offscreen canvas for looks, and *ownership* is tracked separately on a coarse grid
(`gridPx`, default 8 px cells). Every stamp claims the cells it covers. Score is the fraction of cells
you own, recomputed every 200 ms. So the pretty layer and the fair layer never disagree by more than a cell.

## Files

- `index.ts` — the `GameModule`: phases, movement, trails, splats, bombs, bots, host panel.
- `paint.ts` — `PaintLayer`: offscreen canvas + ownership grid + coverage.
- `goo.ts` — goo blob drawing, hand-lettered text, wobbly cards.
- `render.ts` — floor, HUD, share bar, results jars, how-to card.
- `state.ts` / `config.ts` — types and tunables (speeds, timings, brush sizes, bomb rates).

## Test it alone

`npm run dev`, then `http://localhost:5173/?mock=1&game=paint`. WASD + Space (A) / Shift (B),
arrows + Enter (A) / `/` (B). Press `+` a few times for bots.
