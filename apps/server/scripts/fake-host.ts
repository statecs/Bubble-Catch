/**
 * A fake host for testing the server + controller WITHOUT the host app.
 * Creates a room, prints the join code, logs every frame it receives.
 *
 *   npm run fake:host            # against ws://localhost:8787/ws
 *   WS_URL=wss://x.ngrok.app/ws npm run fake:host
 */
import { ReconnectingSocket, ServerToHost, type HostToServer } from '@party/contract';

const url = process.env.WS_URL ?? 'ws://localhost:8787/ws';
const s = new ReconnectingSocket<HostToServer, ServerToHost>(url, ServerToHost);
let code: string | undefined;

s.onOpen(() => s.send({ type: 'create_room', code: code as HostToServer extends { code?: infer C } ? C : never }));
s.onMessage((m) => {
  if (m.type === 'room_created') {
    code = m.code;
    console.log(`\n=== JOIN CODE: ${m.code} ===  (${m.players.length} players already in room)\n`);
    return;
  }
  if (m.type === 'input') {
    const { x, y } = m.input.axis;
    const b = Object.entries(m.input.buttons).filter(([, v]) => v).map(([k]) => k).join('') || '-';
    console.log(`input ${m.playerId.slice(0, 6)}  x=${x.toFixed(2).padStart(5)} y=${y.toFixed(2).padStart(5)}  btn=${b}`);
    return;
  }
  console.log(JSON.stringify(m));
  if (m.type === 'player_joined') s.send({ type: 'to_player', playerId: m.player.id, ui: { text: `hi ${m.player.name}`, vibrate: 100 } });
});
s.onStatus((st) => console.log(`[socket] ${st}`));
