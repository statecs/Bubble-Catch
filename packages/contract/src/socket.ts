/**
 * Tiny reconnecting WebSocket used by host, controller and the fake scripts.
 * Framework-free. Handles mobile Safari putting the tab to sleep:
 * on visibility/pageshow/online we force a fresh connection.
 *
 * Usage:
 *   const s = new ReconnectingSocket<ControllerToServer, ServerToController>(url, ServerToController);
 *   s.onOpen(() => s.send({ type: 'join', ... }));   // fires on EVERY (re)connect
 *   s.onMessage((m) => ...);
 */
import type { z } from 'zod';
import { parseFrame } from './messages';

export type SocketStatus = 'connecting' | 'open' | 'closed';

export interface ReconnectOptions {
  minDelayMs?: number;
  maxDelayMs?: number;
  /** If the tab was hidden longer than this, reconnect on return (iOS keeps dead sockets "open"). */
  staleAfterHiddenMs?: number;
}

export class ReconnectingSocket<Out, In> {
  private ws: WebSocket | null = null;
  private attempts = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private closedByUser = false;
  private hiddenAt = 0;
  private status: SocketStatus = 'closed';
  private openCbs = new Set<() => void>();
  private msgCbs = new Set<(m: In) => void>();
  private statusCbs = new Set<(s: SocketStatus) => void>();
  private readonly opts: Required<ReconnectOptions>;

  constructor(
    private readonly url: string,
    private readonly schema: z.ZodType<In>,
    opts: ReconnectOptions = {},
  ) {
    this.opts = { minDelayMs: 500, maxDelayMs: 8000, staleAfterHiddenMs: 3000, ...opts };
    this.installLifecycleHooks();
    this.connect();
  }

  getStatus(): SocketStatus {
    return this.status;
  }

  onOpen(cb: () => void): () => void {
    this.openCbs.add(cb);
    return () => this.openCbs.delete(cb);
  }
  onMessage(cb: (m: In) => void): () => void {
    this.msgCbs.add(cb);
    return () => this.msgCbs.delete(cb);
  }
  onStatus(cb: (s: SocketStatus) => void): () => void {
    this.statusCbs.add(cb);
    return () => this.statusCbs.delete(cb);
  }

  /** Returns false (and drops the frame) if not currently open. */
  send(msg: Out): boolean {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(msg));
      return true;
    }
    return false;
  }

  /** Drop the current connection and reconnect immediately. */
  reconnectNow(): void {
    if (this.closedByUser) return;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.attempts = 0;
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      try {
        old.close();
      } catch {
        /* ignore */
      }
    }
    this.connect();
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
    this.setStatus('closed');
  }

  private setStatus(s: SocketStatus) {
    if (s === this.status) return;
    this.status = s;
    this.statusCbs.forEach((cb) => cb(s));
  }

  private connect() {
    if (this.closedByUser) return;
    this.setStatus('connecting');
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      if (this.ws !== ws) return;
      this.attempts = 0;
      this.setStatus('open');
      this.openCbs.forEach((cb) => cb());
    };
    ws.onmessage = (ev) => {
      if (this.ws !== ws) return;
      const m = parseFrame(this.schema, typeof ev.data === 'string' ? ev.data : String(ev.data));
      if (m === undefined) {
        console.warn('[socket] dropped unparseable frame', ev.data);
        return;
      }
      this.msgCbs.forEach((cb) => cb(m));
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.setStatus('closed');
      this.scheduleReconnect();
    };
    ws.onerror = () => {
      /* onclose follows */
    };
  }

  private scheduleReconnect() {
    if (this.closedByUser || this.timer) return;
    const delay = Math.min(this.opts.maxDelayMs, this.opts.minDelayMs * 2 ** this.attempts) * (0.75 + Math.random() * 0.5);
    this.attempts++;
    this.timer = setTimeout(() => {
      this.timer = null;
      this.connect();
    }, delay);
  }

  private installLifecycleHooks() {
    if (typeof document === 'undefined' || typeof window === 'undefined') return; // node
    const wake = () => {
      if (this.closedByUser) return;
      const hiddenFor = this.hiddenAt ? Date.now() - this.hiddenAt : 0;
      this.hiddenAt = 0;
      if (this.status !== 'open' || hiddenFor > this.opts.staleAfterHiddenMs) this.reconnectNow();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') this.hiddenAt = Date.now();
      else wake();
    });
    window.addEventListener('pageshow', wake);
    window.addEventListener('online', wake);
    window.addEventListener('focus', () => {
      if (this.status !== 'open') wake();
    });
  }
}

/**
 * Where to find the relay from a browser.
 * Priority: VITE_WS_URL env -> same origin + /ws (works behind Vite proxy and behind a tunnel).
 */
export function defaultWsUrl(envUrl?: string): string {
  if (envUrl) return envUrl;
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${proto}://${location.host}/ws`;
}
