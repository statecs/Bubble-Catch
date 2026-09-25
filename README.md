# Bubble-Catch

**A game of tag you play on a big screen, using your phone as the controller.**

- **Big screen (laptop or TV):** shows the game world, with every player as a coloured dot.
- **Phones:** each one becomes a controller with a joystick and two buttons, **A** and **B**.
- **To join:** scan the QR code on the big screen or type the 4-letter code. No app to install.

## How to play

1. **Get ready.** Everyone runs around. Press **A** when you're ready. The game starts when everyone
   is ready (at least 2 players).
2. **5… 4… 3… 2… 1…** Everyone is placed at a random spot while the rules show on screen.
3. **One player becomes IT** and turns green.
4. **IT chases everyone.** Anyone IT touches gets infected, turns green too, and starts chasing the
   others. The green team keeps growing.
5. **The round lasts 90 seconds:**
   - At least one player still clean at the end: **the survivors win.**
   - Everyone caught before then: **the infected win.**
6. **Results** show who lasted longest, then everyone goes back to the ready-up screen.

## Tricks

- **B = dash.** A quick burst of speed to escape or catch someone. You can use it again after 2.5 seconds.
- **Power-ups** appear on the floor. Run over one to grab it:
  - ⚡ **Speed:** faster for 4 seconds.
  - 🛡 **Shield:** blocks one tag.
  - ❄ **Freeze:** freezes the other team for 2 seconds.

## Run it

```bash
npm install
npm run build && npm start     # open http://<your-ip>:8787/host/ on the big screen
npm run tunnel                 # optional: ngrok link so phones on mobile data can join
```

Players on the same Wi-Fi scan the QR code on the big screen. Open the host page with your
machine's network IP, not `localhost`, so the QR code works on phones.

## Play over the internet (ngrok)

Use this when players aren't on your Wi-Fi (phones on mobile data, or a network that blocks
devices from talking to each other). ngrok gives your machine a public `https://` link.

### One-time setup: your own ngrok account

1. **Install ngrok:** `brew install ngrok` on macOS, or download it from https://ngrok.com/download.
2. **Sign up** at https://dashboard.ngrok.com/signup (the free plan is enough).
3. **Verify your email.** Check your inbox, or resend the verification email from
   https://dashboard.ngrok.com/user/settings. Until you do, ngrok refuses to start with
   `ERR_NGROK_123`.
4. **Connect ngrok to your account.** Copy your authtoken from
   https://dashboard.ngrok.com/get-started/your-authtoken and run:
   ```bash
   ngrok config add-authtoken <your-token>
   ```
   This saves the token in ngrok's own config file on your machine, not in this repo. Never commit
   or share your token. If it leaks, reset it in the dashboard and run the command again.

Check it with `ngrok config check`.

### Start a game

```bash
npm run build && npm start     # terminal 1: game server on port 8787
npm run tunnel                 # terminal 2: prints https://<something>.ngrok-free.app (or .dev)
```

- **Big screen:** open `https://<your-ngrok-url>/host/`. The QR code points at the tunnel automatically.
- **Players:** scan the QR code, or open `https://<your-ngrok-url>/` and type the join code.
- **Browser warning:** the free plan shows a one-time "You are about to visit…" page on each
  device. Tap **Visit Site**.

### Good to know

- **Your link can change.** On some free accounts the link is different every time you restart
  `npm run tunnel`. To keep the same link, use the free static domain listed at
  https://dashboard.ngrok.com/domains:
  `ngrok http 8787 --domain=<your-domain>` (newer ngrok versions call this flag `--url`).
- **QR still shows an old link?** Open the host once with
  `?controller=https://<your-ngrok-url>/` added to the URL. The big screen remembers it.
- **While developing** (`npm run dev`), use `npm run tunnel:dev` instead. It tunnels the phone app on
  port 5174. Then open the host at `http://localhost:5173/?controller=https://<your-ngrok-url>/`.
- **To stop:** press `Ctrl+C` in the tunnel terminal. Anyone with the link can reach your game
  while the tunnel is running, but only the game, nothing else on your machine.

## Behind the scenes

- **The phones only send your moves.**
- **The big screen runs the whole game.**
- **A small server in between just passes messages along.**

That's why anyone can join from a web browser, and why you can swap in a different game without
changing the phone side.

## More

- Full game details: [apps/host/src/games/tag/README.md](apps/host/src/games/tag/README.md)
- Developer orientation, run options and the rules: [CLAUDE.md](CLAUDE.md). Docs live in [docs/](docs).
