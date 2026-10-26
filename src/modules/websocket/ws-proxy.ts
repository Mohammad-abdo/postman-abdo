import { Server } from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import { verifyToken } from '../../core/middleware/auth.middleware';

/** Messages from the browser to the proxy. */
type ClientMessage =
  | { type: 'connect'; url: string; headers?: { key: string; value: string }[]; protocols?: string[]; strictSSL?: boolean; maxMessageSize?: number }
  | { type: 'send'; id?: string; data: string; isBinary?: boolean }
  | { type: 'close'; code?: number; reason?: string };

const PROXY_PATH = '/ws-proxy';

/**
 * Browsers cannot set custom headers on WebSocket handshakes, so the client talks to this proxy,
 * which opens the real connection on its behalf (like Postman's desktop agent).
 */
class ProxySession {
  private target: WebSocket | null = null;

  constructor(private readonly client: WebSocket) {
    client.on('message', (raw) => this.handle(raw.toString()));
    client.on('close', () => this.target?.terminate());
  }

  private emit(message: Record<string, unknown>) {
    if (this.client.readyState === WebSocket.OPEN) this.client.send(JSON.stringify({ ...message, time: Date.now() }));
  }

  private handle(raw: string) {
    let message: ClientMessage;
    try {
      message = JSON.parse(raw);
    } catch {
      return;
    }
    if (message.type === 'connect') this.connect(message);
    else if (message.type === 'send') this.send(message);
    else if (message.type === 'close') this.target?.close(message.code || 1000, message.reason || '');
  }

  private connect(message: Extract<ClientMessage, { type: 'connect' }>) {
    try {
      const headers = Object.fromEntries((message.headers || []).filter((h) => h.key).map((h) => [h.key, h.value]));
      const protocols = (message.protocols || []).filter(Boolean);
      const target = new WebSocket(message.url, protocols.length ? protocols : undefined, {
        headers,
        rejectUnauthorized: message.strictSSL !== false,
        maxPayload: (message.maxMessageSize || 10) * 1024 * 1024,
      });
      this.target = target;

      target.on('upgrade', (res) =>
        this.emit({
          type: 'handshake',
          status: res.statusCode,
          headers: Object.entries(res.headers).map(([key, value]) => ({ key, value: Array.isArray(value) ? value.join(', ') : String(value) })),
        }),
      );
      target.on('open', () => this.emit({ type: 'open', url: message.url }));
      target.on('message', (data, isBinary) => {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        this.emit({ type: 'message', data: buf.toString(isBinary ? 'base64' : 'utf8'), isBinary, size: buf.length });
      });
      target.on('close', (code, reason) => {
        this.emit({ type: 'close', code, reason: reason.toString() });
        this.target = null;
      });
      target.on('unexpected-response', (_req, res) => this.emit({ type: 'error', message: `Unexpected server response: ${res.statusCode}` }));
      target.on('error', (err) => this.emit({ type: 'error', message: err.message }));
    } catch (e) {
      this.emit({ type: 'error', message: (e as Error).message });
    }
  }

  private send(message: Extract<ClientMessage, { type: 'send' }>) {
    if (this.target?.readyState !== WebSocket.OPEN) return this.emit({ type: 'error', message: 'Not connected' });
    const payload = message.isBinary ? Buffer.from(message.data, 'base64') : message.data;
    this.target.send(payload, { binary: !!message.isBinary }, (err) =>
      this.emit(err ? { type: 'error', message: err.message } : { type: 'sent', id: message.id }),
    );
  }
}

export function attachWsProxy(server: Server) {
  const wss = new WebSocketServer({ noServer: true });
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.pathname !== PROXY_PATH) return;
    if (!verifyToken(url.searchParams.get('token') || '')) return socket.destroy();
    wss.handleUpgrade(req, socket, head, (ws) => new ProxySession(ws));
  });
}
