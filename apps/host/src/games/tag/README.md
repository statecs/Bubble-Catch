# Tag / Infection

Pick it on the host's start screen, or open `/host/?game=tag`. One player starts as **IT**. Everyone IT touches gets infected
and joins their team. Survivors win if at least one of them is still clean when the clock runs out.

## Controls (phone)

| Input    | Lobby                 | During a round              |
|----------|-----------------------|-----------------------------|
| Joystick | move around           | move                        |
| **A**    | toggle ready          | —                           |
| **B**    | dash                  | dash (short burst, 2.5 s cooldown) |

Dash goes in the direction you last pushed the stick, so it works from standing still.

## Host controls

Buttons top-right of the game area, or keys: **G** start now (skips ready-up, works with one player),
**Esc** pause / resume (the game clock stops, so timers and cooldowns freeze too), **R** reset to lobby,
**+ / −** add or remove a test bot. Bots wander in the lobby and chase / flee during a round; they count
as ready, so one human plus bots can start a round for demo prep. Bots never get phone hints.

## How a round goes

1. **Lobby.** Everyone runs around freely. The big screen shows a drawn phone pad (stick = move,
   A = ready, B = dash) and each dot carries a badge: "move the stick" → "press A when ready" → "✓ READY".
   Phones get the same coaching as hints. When every connected human (min. 2 players) is ready,
   the round starts on its own.
2. **Countdown (5 s).** Everyone is respawned at a random spot and frozen; a rules card is shown.
3. **Play (90 s).** A random player becomes IT (shown on screen and on their phone).
   - Touching a survivor infects them. They turn green and now hunt the others.
   - A freshly infected player can't tag anyone for 0.8 s (no instant chain reactions).
   - The infected are 12% faster than survivors.
   - The round ends when time is up or nobody is left clean. A power-up legend sits bottom-left.
4. **Results (8 s).** Ranking on the big screen, your place on your phone, then back to the lobby.

**Ranking:** survivors first, then the infected by how long they lasted, and the original IT last.

**Joining mid-round:** you spawn already infected, so there's no free win.

## Power-ups

One spawns every 5 s (max 5 on the floor), never right on top of a player. Run over it to pick it up.

| Icon | Name   | Effect |
|------|--------|--------|
| ⚡   | Speed  | 1.6× speed for 4 s. |
| 🛡   | Shield | Blocks one tag, then 0.7 s of immunity to get away. If an infected player picks it up, they get Speed instead. |
| ❄   | Freeze | Freezes the **other team** for 2 s. |

## Tuning

All numbers above live in [`config.ts`](config.ts) (speeds, timings, power-up rates, dash).
Change them there, not in the game logic.

## Files

- `index.ts` — the `GameModule`: phases, movement, tagging, power-ups, phone hints.
- `state.ts` — per-player state (`Ent`) and the phase types.
- `render.ts` — canvas drawing (players, power-ups, HUD, how-to card, rules card, results, pause).
- `config.ts` — tunables and power-up definitions.

## Test it alone

`npm run dev`, then open `http://localhost:5173/?mock=1&game=tag`: two keyboard players,
WASD + Space (A) / Shift (B), and arrows + Enter (A) / `/` (B).
