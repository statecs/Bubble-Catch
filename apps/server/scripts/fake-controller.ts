/**
 * A fake phone for testing the server + host WITHOUT the controller app.
 * Joins a room and sends a slowly rotating joystick vector at 10 Hz.
 *
 *   npm run fake:controller -- ABCD            # join code
 *   npm run fake:controller -- ABCD Alice      # with a name
 *   WS_URL=wss://x.ngrok.app/ws npm run fake:controller -- ABCD
 */
import { ReconnectingSocket, ServerToController, type ControllerToServer } from '@party/contract';
import { randomUUID } from 'node:crypto';

const [code, name = `Bot${Math.floor(Math.random() * 900 + 100)}`] = process.argv.slice(2);
if (!code) {
  console.error('usage: npm run fake:controller -- <CODE> [name]');
  process.exit(1);
}
const url = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const playerId = process.env.PLAYER_ID ?? randomUUID();
const s = new ReconnectingSocket<ControllerToServer, ServerToController>(url, ServerToController);

s.onOpen(() => s.send({ type: 'join', code: code.toUpperCase(), playerId, name }));
s.onMessage((m) => {
  console.log(JSON.stringify(m));
  if (m.type === 'join_error' || m.type === 'kicked' || m.type === 'room_closed') process.exit(1);
});
s.onStatus((st) => console.log(`[socket] ${st}`));

let t = 0;
setInterval(() => {
  t += 0.1;
  s.send({
    type: 'input',
    input: { axis: { x: Math.cos(t), y: Math.sin(t) }, buttons: { a: Math.floor(t) % 4 === 0, b: false } },
  });
}, 100);
