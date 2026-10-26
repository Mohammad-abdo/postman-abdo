import { randomUUID } from 'crypto';
import { Server } from 'http';
import Redis from 'ioredis';
import WebSocket, { WebSocketServer } from 'ws';
import { env } from '../../config/env';
import { getRedis, isRedisReady } from '../../core/cache/redis';
import { authenticate } from '../../core/middleware/auth.middleware';

/**
 * Real-time event hub.
 * Each signed-in tab keeps one live connection: a WebSocket at `/ws`, or — when a proxy blocks WebSockets —
 * a Server-Sent Events stream (see realtime.routes.ts). Events are addressed to user ids. They are delivered to
 * this instance's connections immediately and, with Redis configured, published so other API instances deliver
 * them to their own connections.
 */

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

/** A live connection, whatever the transport. */
export interface Connection {
  send(data: string): void;
}

type ClientHandler = (userId: string, message: { type: string; payload?: any }) => void;

const PATH = '/ws';
const CHANNEL = 'fp:realtime';
const PRESENCE_KEY = 'fp:presence';
const PRESENCE_TTL_MS = 70_000;
const PING_INTERVAL_MS = 30_000;
/** Lets an instance ignore its own pub/sub messages (it already delivered them locally). */
const INSTANCE_ID = randomUUID();

const connections = new Map<string, Set<Connection>>();
const clientHandlers = new Map<string, ClientHandler>();
const memoryPresence = new Map<string, number>();
let subscriber: Redis | null = null;

function deliverLocally(userIds: string[], event: RealtimeEvent) {
  const data = JSON.stringify(event);
  userIds.forEach((id) =>
    connections.get(id)?.forEach((c) => {
      try {
        c.send(data);
      } catch {
        /* a dying connection is cleaned up by its close handler */
      }
    }),
  );
}

async function markPresence(userId: string, online: boolean) {
  if (online) memoryPresence.set(userId, Date.now());
  else memoryPresence.delete(userId);
  const redis = isRedisReady() ? getRedis() : null;
  if (!redis) return;
  if (online) await redis.hset(PRESENCE_KEY, userId, String(Date.now())).catch(() => undefined);
  else await redis.hdel(PRESENCE_KEY, userId).catch(() => undefined);
}

/** Presence changes are broadcast to users who share a workspace; resolved lazily to avoid an import cycle. */
let presenceListener: ((userId: string, online: boolean) => void) | null = null;
export const onPresenceChange = (fn: (userId: string, online: boolean) => void) => (presenceListener = fn);

/** Registers a connection for a user; returns the function to call when it closes. */
export function registerConnection(userId: string, connection: Connection) {
  const first = !connections.has(userId);
  if (first) connections.set(userId, new Set());
  connections.get(userId)!.add(connection);
  markPresence(userId, true);
  if (first) presenceListener?.(userId, true);
  connection.send(JSON.stringify({ type: 'hello', payload: { userId, time: Date.now() } }));

  return () => {
    const set = connections.get(userId);
    set?.delete(connection);
    if (set && !set.size) {
      connections.delete(userId);
      markPresence(userId, false);
      presenceListener?.(userId, false);
    }
  };
}

export const realtime = {
  /** Sends an event to every open connection of the given users (on every instance). */
  emit(userIds: string[] | string, type: string, payload: unknown) {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
    if (!ids.length) return;
    const event = { type, payload };
    deliverLocally(ids, event);
    const redis = isRedisReady() ? getRedis() : null;
    if (redis && subscriber) redis.publish(CHANNEL, JSON.stringify({ origin: INSTANCE_ID, userIds: ids, event })).catch(() => undefined);
  },

  /** Handles a message sent by a client (WebSocket frame or POST /api/realtime/send). */
  receive(userId: string, message: { type: string; payload?: any }) {
    clientHandlers.get(message.type)?.(userId, message);
  },

  /** Registers a handler for messages sent by clients (e.g. "typing"). */
  on(type: string, handler: ClientHandler) {
    clientHandlers.set(type, handler);
  },

  /** Keeps a user marked online (SSE heartbeats). */
  touch: (userId: string) => markPresence(userId, true),

  /** Which of these users currently have the app open. */
  async online(userIds: string[]): Promise<string[]> {
    const now = Date.now();
    const redis = isRedisReady() ? getRedis() : null;
    if (redis && userIds.length) {
      const values = await redis.hmget(PRESENCE_KEY, ...userIds).catch(() => null);
      if (values) return userIds.filter((_, i) => values[i] && now - Number(values[i]) < PRESENCE_TTL_MS);
    }
    return userIds.filter((id) => connections.has(id) || now - (memoryPresence.get(id) || 0) < PRESENCE_TTL_MS);
  },

  isConnectedHere: (userId: string) => connections.has(userId),
};

function startSubscriber() {
  if (!env.redisUrl) return;
  subscriber = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  subscriber.on('error', () => undefined);
  subscriber.subscribe(CHANNEL).catch(() => undefined);
  subscriber.on('message', (_channel, raw) => {
    try {
      const { origin, userIds, event } = JSON.parse(raw);
      if (origin !== INSTANCE_ID) deliverLocally(userIds, event);
    } catch {
      /* ignore malformed messages */
    }
  });
}

export function attachRealtime(server: Server) {
  startSubscriber();
  const wss = new WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });

  server.on('upgrade', async (req, socket, head) => {
    const url = new URL(req.url || '', 'http://localhost');
    if (url.pathname !== PATH) return;
    try {
      const user = await authenticate(url.searchParams.get('token') || '');
      wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user.id));
    } catch {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  });

  wss.on('connection', (ws: WebSocket & { alive?: boolean }, userId: string) => {
    ws.alive = true;
    const unregister = registerConnection(userId, { send: (data) => ws.readyState === WebSocket.OPEN && ws.send(data) });

    ws.on('pong', () => {
      ws.alive = true;
      markPresence(userId, true);
    });
    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', payload: Date.now() }));
        realtime.receive(userId, message);
      } catch {
        /* ignore malformed client messages */
      }
    });
    ws.on('close', unregister);
  });

  // Drop dead connections (laptops going to sleep, flaky mobile networks).
  setInterval(() => {
    wss.clients.forEach((ws: WebSocket & { alive?: boolean }) => {
      if (!ws.alive) return ws.terminate();
      ws.alive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS).unref();
}
