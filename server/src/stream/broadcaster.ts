import { WebSocket } from 'ws';
import { StreamEvent } from '@healthdash/shared';

/**
 * Manages the set of connected WebSocket clients and broadcasts events to all
 * of them.  Fastify's websocket plugin exposes the raw ws.WebSocket, so we
 * work at that level rather than wrapping it.
 */
export class WebSocketBroadcaster {
  private clients: Set<WebSocket> = new Set();

  addClient(socket: WebSocket): void {
    this.clients.add(socket);
  }

  removeClient(socket: WebSocket): void {
    this.clients.delete(socket);
  }

  broadcast(event: StreamEvent): void {
    if (this.clients.size === 0) return;
    const payload = JSON.stringify(event);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(payload);
      }
    }
  }

  get connectionCount(): number {
    return this.clients.size;
  }
}
