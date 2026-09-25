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

## Behind the scenes

- **The phones only send your moves.**
- **The big screen runs the whole game.**
- **A small server in between just passes messages along.**

That's why anyone can join from a web browser, and why you can swap in a different game without
changing the phone side.

## More

- Full game details: [apps/host/src/games/tag/README.md](apps/host/src/games/tag/README.md)
- Developer orientation, run options and the rules: [CLAUDE.md](CLAUDE.md). Docs live in [docs/](docs).
