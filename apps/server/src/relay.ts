/**
 * The relay. Rooms, join codes, player identity, forwarding. NO game logic.
 * If you find yourself reading `input.axis` in here, stop: that belongs in the host.
 */
import type { WebSocket } from 'ws';
import {
  ClientToServer,
  ControllerToServer,
  HostToServer,
  LIMITS,
  PLAYER_COLORS,
  generateJoinCode,
  parseFrame,
  type JoinCode,
  type Player,
  type PlayerId,
  type ServerToController,
  type ServerToHost,
} from '@party/contract';

interface PlayerSlot {
  player: Player;
  socket: WebSocket | null;
}

interface Room {
  code: JoinCode;
  host: WebSocket | null;
  players: Map<PlayerId, PlayerSlot>;
  colorCursor: number;
  closeTimer: ReturnType<typeof setTimeout> | null;
}

type Role =
  | { kind: 'unknown' }
  | { kind: 'host'; room: Room }
  | { kind: 'controller'; room: Room; playerId: PlayerId };

const log = (...a: unknown[]) => console.log(new Date().toISOString().slice(11, 19), ...a);

export class Relay {
  private rooms = new Map<JoinCode, Room>();
  private roles = new WeakMap<WebSocket, Role>();

  handle(ws: WebSocket): void {
    this.roles.set(ws, { kind: 'unknown' });
    ws.on('message', (data) => this.onMessage(ws, data.toString()));
    ws.on('close', () => this.onClose(ws));
    ws.on('error', (e) => log('socket error', e.message));
  }

  roomCount(): number {
    return this.rooms.size;
  }

  // ---------- dispatch ----------

  private onMessage(ws: WebSocket, raw: string) {
    const role = this.roles.get(ws) ?? { kind: 'unknown' };
    if (role.kind === 'unknown') return this.onFirstFrame(ws, raw);
    if (role.kind === 'host') {
      const m = parseFrame(HostToServer, raw);
      if (!m) return this.sendRaw(ws, { type: 'error', message: 'bad host frame' });
      return this.onHostFrame(ws, role.room, m);
    }
    const m = parseFrame(ControllerToServer, raw);
    if (!m) return this.sendRaw(ws, { type: 'error', message: 'bad controller frame' });
    return this.onControllerFrame(ws, role.room, role.playerId, m);
  }

  /** The first frame decides the role: create_room => host, join => controller. */
  private onFirstFrame(ws: WebSocket, raw: string) {
    const m = parseFrame(ClientToServer, raw);
    if (!m) return this.sendRaw(ws, { type: 'error', message: 'first frame must be create_room or join' });
    if (m.type === 'create_room') return this.createRoom(ws, m.code);
    if (m.type === 'join') return this.join(ws, m.code, m.playerId, m.name);
    this.sendRaw(ws, { type: 'error', message: `unexpected first frame ${m.type}` });
  }

  // ---------- host ----------

  private createRoom(ws: WebSocket, wanted?: JoinCode) {
    let room = wanted ? this.rooms.get(wanted) : undefined;
    if (room && room.host && room.host !== ws) {
      // Someone else holds that code; give a fresh room instead.
      room = undefined;
    }
    if (!room) {
      let code = generateJoinCode();
      while (this.rooms.has(code)) code = generateJoinCode();
      room = { code, host: null, players: new Map(), colorCursor: 0, closeTimer: null };
      this.rooms.set(code, room);
      log(`room ${code} created`);
    } else {
      log(`room ${room.code} reclaimed by new host socket`);
    }
    if (room.closeTimer) {
      clearTimeout(room.closeTimer);
      room.closeTimer = null;
    }
    room.host = ws;
    this.roles.set(ws, { kind: 'host', room });
    this.toHost(room, {
      type: 'room_created',
      code: room.code,
      players: [...room.players.values()].map((s) => s.player),
    });
  }

  private onHostFrame(_ws: WebSocket, room: Room, m: HostToServer) {
    switch (m.type) {
      case 'create_room':
        return; // already a host; ignore
      case 'to_player': {
        const slot = room.players.get(m.playerId);
        if (slot?.socket) this.sendRaw(slot.socket, { type: 'ui', ui: m.ui });
        return;
      }
      case 'to_all':
        for (const slot of room.players.values()) if (slot.socket) this.sendRaw(slot.socket, { type: 'ui', ui: m.ui });
        return;
      case 'kick': {
        const slot = room.players.get(m.playerId);
        if (!slot) return;
        room.players.delete(m.playerId);
        if (slot.socket) {
          this.sendRaw(slot.socket, { type: 'kicked' });
          this.roles.set(slot.socket, { kind: 'unknown' });
          slot.socket.close();
        }
        this.toHost(room, { type: 'player_left', playerId: m.playerId });
        log(`room ${room.code}: kicked ${slot.player.name}`);
        return;
      }
    }
  }

  // ---------- controller ----------

  private join(ws: WebSocket, code: JoinCode, playerId: PlayerId, name: string) {
    const room = this.rooms.get(code);
    if (!room) return this.sendRaw(ws, { type: 'join_error', reason: 'room_not_found' });

    let slot = room.players.get(playerId);
    if (slot) {
      // Reconnect: same identity, new socket. Kill the stale socket if any.
      if (slot.socket && slot.socket !== ws) {
        this.roles.set(slot.socket, { kind: 'unknown' });
        slot.socket.close();
      }
      slot.socket = ws;
      slot.player.connected = true;
      slot.player.name = name; // allow rename on rejoin
      this.roles.set(ws, { kind: 'controller', room, playerId });
      this.sendRaw(ws, { type: 'joined', code, player: slot.player });
      this.toHost(room, { type: 'player_reconnected', playerId });
      log(`room ${code}: ${name} reconnected`);
      return;
    }

    if (room.players.size >= LIMITS.maxPlayersPerRoom) return this.sendRaw(ws, { type: 'join_error', reason: 'room_full' });
    const nameTaken = [...room.players.values()].some((s) => s.player.name.toLowerCase() === name.toLowerCase());
    if (nameTaken) return this.sendRaw(ws, { type: 'join_error', reason: 'name_taken' });

    const color = PLAYER_COLORS[room.colorCursor++ % PLAYER_COLORS.length]!;
    slot = { player: { id: playerId, name, color, connected: true }, socket: ws };
    room.players.set(playerId, slot);
    this.roles.set(ws, { kind: 'controller', room, playerId });
    this.sendRaw(ws, { type: 'joined', code, player: slot.player });
    this.toHost(room, { type: 'player_joined', player: slot.player });
    log(`room ${code}: ${name} joined (${room.players.size} players)`);
  }

  private onControllerFrame(ws: WebSocket, room: Room, playerId: PlayerId, m: ControllerToServer) {
    switch (m.type) {
      case 'input':
        return this.toHost(room, { type: 'input', playerId, input: m.input, t: Date.now() });
      case 'join':
        return; // already joined on this socket; ignore
      case 'leave': {
        room.players.delete(playerId);
        this.roles.set(ws, { kind: 'unknown' });
        this.toHost(room, { type: 'player_left', playerId });
        log(`room ${room.code}: ${playerId} left`);
        return;
      }
    }
  }

  // ---------- disconnects ----------

  private onClose(ws: WebSocket) {
    const role = this.roles.get(ws);
    if (!role || role.kind === 'unknown') return;
    this.roles.set(ws, { kind: 'unknown' });

    if (role.kind === 'controller') {
      const slot = role.room.players.get(role.playerId);
      if (slot && slot.socket === ws) {
        slot.socket = null;
        slot.player.connected = false;
        this.toHost(role.room, { type: 'player_disconnected', playerId: role.playerId });
        log(`room ${role.room.code}: ${slot.player.name} disconnected`);
      }
      return;
    }

    const room = role.room;
    if (room.host !== ws) return;
    room.host = null;
    log(`room ${room.code}: host gone, holding ${LIMITS.hostReclaimMs / 1000}s for reclaim`);
    room.closeTimer = setTimeout(() => this.closeRoom(room), LIMITS.hostReclaimMs);
  }

  private closeRoom(room: Room) {
    this.rooms.delete(room.code);
    for (const slot of room.players.values()) {
      if (slot.socket) {
        this.sendRaw(slot.socket, { type: 'room_closed' });
        this.roles.set(slot.socket, { kind: 'unknown' });
        slot.socket.close();
      }
    }
    log(`room ${room.code} closed`);
  }

  // ---------- send ----------

  private toHost(room: Room, m: ServerToHost) {
    if (room.host) this.sendRaw(room.host, m);
  }

  private sendRaw(ws: WebSocket, m: ServerToController | ServerToHost) {
    if (ws.readyState === ws.OPEN) ws.send(JSON.stringify(m));
  }
}
