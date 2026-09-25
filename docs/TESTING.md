# Testing a slice in isolation

Everything speaks the same JSON contract, so any side can be replaced by a fake.

| I'm working on… | Run | Replace the rest with |
|---|---|---|
| **Server** | `npm run dev -w apps/server` | `npm run fake:host` (prints a code, logs frames) + `npm run fake:controller -- CODE Alice` |
| **Controller UI** | `npm run dev -w apps/controller` → `http://localhost:5174/?mock=1` | nothing: pad renders, sends are logged on screen |
| **Controller ↔ server** | server + controller dev | `npm run fake:host` as the big screen |
| **Host UI / a game** | `npm run dev -w apps/host` → `http://localhost:5173/?mock=1&game=dots` | keyboard players: WASD+Space+Shift, arrows+Enter+/ ; `p` toggles player 2 away |
| **Host ↔ server** | server + host dev | `npm run fake:controller -- CODE Bob` (rotating stick, A every ~4 s) |
| **Everything** | `npm run dev` | real phones; or several `fake:controller` |

Env overrides (put in `apps/<app>/.env.local`, or export):
- `VITE_WS_URL` — relay URL if not same-origin `/ws`.
- `VITE_CONTROLLER_URL` — what the host's QR encodes (or use `?controller=` on the host once).
- `PORT` — relay port (default 8787). `WS_URL` — relay URL for the fake scripts.

## Smoke test with real phones (the demo)
1. `npm run build && npm start`, then `npm run tunnel`; copy the https URL.
2. Laptop: open `https://<tunnel>/host/`. See code + QR.
3. Two phones (mobile data): scan QR → name → Join. Both appear in the lobby; dots move with the sticks.
4. Lock one phone for 10 s, unlock: the phone rejoins on its own, same name, same dot, lobby shows it back.
5. Reload the host tab: same room code, players still listed (reclaim).

## Reconnection notes (mobile Safari)
iOS often keeps a dead socket in `readyState OPEN` after the tab was backgrounded. `ReconnectingSocket`
therefore forces a fresh connection on `visibilitychange`/`pageshow`/`online` if the tab was hidden > 3 s,
then `onOpen` fires and the app re-sends `join` with the same `playerId`. The relay replaces the old
socket and tells the host `player_reconnected`.
