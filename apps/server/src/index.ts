import { createServer } from 'node:http';
import { WebSocketServer, type WebSocket } from 'ws';
import { Relay } from './relay';
import { serveStatic } from './static';

const PORT = Number(process.env.PORT ?? 8787);
const HEARTBEAT_MS = 15_000;

const http = createServer(serveStatic);
const wss = new WebSocketServer({ server: http, path: '/ws' });
const relay = new Relay();

const alive = new WeakSet<WebSocket>();
wss.on('connection', (ws) => {
  alive.add(ws);
  ws.on('pong', () => alive.add(ws));
  relay.handle(ws);
});

// Protocol-level heartbeat: browsers answer pings automatically, so a missing
// pong means the phone is truly gone (asleep / offline) and we free the socket.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!alive.has(ws)) {
      ws.terminate();
      continue;
    }
    alive.delete(ws);
    ws.ping();
  }
}, HEARTBEAT_MS);

http.listen(PORT, () => {
  console.log(`relay listening on http://localhost:${PORT}  (ws at /ws, health at /health)`);
  console.log(`built apps (after npm run build): controller http://localhost:${PORT}/  host http://localhost:${PORT}/host/`);
});
