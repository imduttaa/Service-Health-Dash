import { StreamEvent } from '@healthdash/shared';

export type ConnectionStatus = 'connecting' | 'connected' | 'disconnected' | 'reconnecting';
export type StreamEventHandler = (event: StreamEvent) => void;
export type StatusChangeHandler = (status: ConnectionStatus) => void;

/**
 * Manages a WebSocket connection to the BFF stream endpoint.
 *
 * Key design decisions:
 *  - Exponential backoff with jitter prevents thundering herd on server restart
 *  - Event handlers are stored in a Set so multiple consumers can subscribe
 *    without coupling
 *  - We use a "generation" counter to discard events from stale connections
 *    during reconnection windows
 */
export class WsManager {
  private ws: WebSocket | null = null;
  private status: ConnectionStatus = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private generation = 0; // invalidates callbacks from old sockets
  private destroyed = false;

  private readonly eventHandlers = new Set<StreamEventHandler>();
  private readonly statusHandlers = new Set<StatusChangeHandler>();

  constructor(private readonly url: string) {}

  // ── Public API ────────────────────────────────────────────────────────

  connect(): void {
    if (this.destroyed) return;
    this.clearReconnectTimer();
    this.setStatus('connecting');
    this.openSocket();
  }

  disconnect(): void {
    this.destroyed = true;
    this.clearReconnectTimer();
    this.ws?.close(1000, 'client disconnect');
    this.ws = null;
    this.setStatus('disconnected');
  }

  onEvent(handler: StreamEventHandler): () => void {
    this.eventHandlers.add(handler);
    return () => this.eventHandlers.delete(handler);
  }

  onStatusChange(handler: StatusChangeHandler): () => void {
    this.statusHandlers.add(handler);
    return () => this.statusHandlers.delete(handler);
  }

  getStatus(): ConnectionStatus {
    return this.status;
  }

  // ── Private socket lifecycle ──────────────────────────────────────────

  private openSocket(): void {
    const gen = ++this.generation;
    const socket = new WebSocket(this.url);
    this.ws = socket;

    socket.onopen = () => {
      if (gen !== this.generation) return;
      this.reconnectAttempt = 0;
      this.setStatus('connected');
    };

    socket.onmessage = (ev: MessageEvent<string>) => {
      if (gen !== this.generation) return;
      try {
        const event = JSON.parse(ev.data) as StreamEvent | { type: 'connected' };
        // Skip the handshake message
        if (event.type === 'connected') return;
        for (const handler of this.eventHandlers) {
          handler(event as StreamEvent);
        }
      } catch {
        // Malformed JSON — ignore silently
      }
    };

    socket.onerror = () => {
      if (gen !== this.generation) return;
      // onclose will fire right after, which handles reconnect
    };

    socket.onclose = (ev) => {
      if (gen !== this.generation) return;
      if (ev.wasClean && ev.code === 1000) {
        this.setStatus('disconnected');
        return;
      }
      this.scheduleReconnect();
    };
  }

  private scheduleReconnect(): void {
    if (this.destroyed) return;
    this.setStatus('reconnecting');

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, capped at 30s + ±500ms jitter
    const base = Math.min(1000 * 2 ** this.reconnectAttempt, 30_000);
    const jitter = Math.random() * 500;
    const delay = base + jitter;

    this.reconnectAttempt++;
    this.reconnectTimer = setTimeout(() => {
      if (!this.destroyed) this.openSocket();
    }, delay);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer !== null) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  private setStatus(status: ConnectionStatus): void {
    if (this.status === status) return;
    this.status = status;
    for (const handler of this.statusHandlers) {
      handler(status);
    }
  }
}

// ── Singleton instance ────────────────────────────────────────────────────────

const WS_URL =
  import.meta.env.VITE_WS_URL ??
  `ws://${window.location.hostname}:3001/api/stream`;

export const wsManager = new WsManager(WS_URL);
