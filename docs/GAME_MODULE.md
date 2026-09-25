# Game modules

Interface: `apps/host/src/game/GameModule.ts`. Runtime: `apps/host/src/game/runtime.ts`. Both frozen.
Games live in `apps/host/src/games/<id>/index.ts` and are registered in `apps/host/src/games/index.ts`:
add the module to `GAMES`, and a card (name, one-line blurb, `preview.jpg` in your game folder) to
`GAME_CARDS` so it shows up in the host's game picker.
Select with `?game=<id>` on the host URL.

## What you implement
```ts
export const MyGame: GameModule = {
  id: 'mygame', name: 'My Game',
  mount(ctx) { /* build DOM/canvas in ctx.container, start your RAF loop */ },
  unmount()  { /* cancel loop, remove listeners; runtime clears the container */ },
  onPlayerJoin?(player)        // new identity in the room (also called for existing players at mount)
  onPlayerLeave?(player)       // gone for good
  onPlayerConnection?(player)  // player.connected flipped (phone asleep / back)
  onInput?(playerId, input, t) // optional push; most games just poll ctx.inputs each frame
};
```

## What you receive (`GameContext`)
- `container: HTMLElement` — yours exclusively. Fills the game area; observe resizes yourself.
- `players: ReadonlyMap<PlayerId, Player>` — live roster incl. `color`, `name`, `connected`.
- `inputs: ReadonlyMap<PlayerId, InputState>` — latest full state per player. Missing ⇒ `ZERO_INPUT`.
- `sendToPlayer(id, ui)` / `sendToAll(ui)` — push a `PlayerUi` hint (colour / text / vibrate) to phones.

## Rules
- The game owns its loop and all state. The host browser is authoritative; nothing is computed elsewhere.
- Never touch the WebSocket, the contract, `game/*`, `connection.ts`, `lobby.ts` or `main.ts`.
- Treat disconnected players as present but idle (they may come back with the same id).
- Any dependency you add (Pixi, Phaser, matter-js…) goes into `apps/host/package.json` and is imported
  only from your game folder. Say so in the team channel.
- Typecheck: `npm run typecheck -w apps/host`. Test alone: `http://localhost:5173/?mock=1&game=<id>`
  (WASD / arrows drive two fake players, `p` toggles player 2 away/back).

## Reference implementations
- `apps/host/src/games/dots/` — minimal: one dot per player, joystick moves it. Copy it to start a new game.
- `apps/host/src/games/tag/` — the real thing: phases (ready-up lobby → countdown → play →
  results), a `config.ts` of tunables, floor powerups, dash on B, phone hints via `PlayerUi`. Host keys: G start, R reset.
- `apps/host/src/games/paint/` — Paint to Conquer (`?game=paint`): trails on an offscreen canvas plus an
  ownership grid for scoring, World of Goo-style blobs. Shows how a game can own heavier rendering.
