import { Server } from 'http';
import Redis from 'ioredis';
import WebSocket, { WebSocketServer } from 'ws';
import { env } from '../../config/env';
import { getRedis, isRedisReady } from '../../core/cache/redis';
import { authenticate } from '../../core/middleware/auth.middleware';

/**
 * Real-time event hub.
 * Every signed-in tab keeps one WebSocket to `/ws`. Events are addressed to user ids; with Redis configured they
 * are fanned out through pub/sub so any API instance can notify a user connected to another instance.
 */

export interface RealtimeEvent {
  type: string;
  payload: unknown;
}

type ClientHandler = (userId: string, message: { type: string; payload?: any }) => void;

const PATH = '/ws';
const CHANNEL = 'fp:realtime';
const PRESENCE_KEY = 'fp:presence';
const PRESENCE_TTL_MS = 70_000;
const PING_INTERVAL_MS = 30_000;

const sockets = new Map<string, Set<WebSocket>>();
const clientHandlers = new Map<string, ClientHandler>();
const memoryPresence = new Map<string, number>();
let subscriber: Redis | null = null;

function deliverLocally(userIds: string[], event: RealtimeEvent) {
  const data = JSON.stringify(event);
  userIds.forEach((id) => sockets.get(id)?.forEach((ws) => ws.readyState === WebSocket.OPEN && ws.send(data)));
}

async function markPresence(userId: string, online: boolean) {
  if (online) memoryPresence.set(userId, Date.now());
  else memoryPresence.delete(userId);
  const redis = isRedisReady() ? getRedis() : null;
  if (!redis) return;
  if (online) await redis.hset(PRESENCE_KEY, userId, String(Date.now())).catch(() => undefined);
  else await redis.hdel(PRESENCE_KEY, userId).catch(() => undefined);
}

export const realtime = {
  /** Sends an event to every open connection of the given users (across all instances). */
  emit(userIds: string[] | string, type: string, payload: unknown) {
    const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
    if (!ids.length) return;
    const event = { type, payload };
    const redis = isRedisReady() ? getRedis() : null;
    if (redis && subscriber) redis.publish(CHANNEL, JSON.stringify({ userIds: ids, event })).catch(() => deliverLocally(ids, event));
    else deliverLocally(ids, event);
  },

  /** Registers a handler for messages sent by clients (e.g. "typing"). */
  on(type: string, handler: ClientHandler) {
    clientHandlers.set(type, handler);
  },

  /** Which of these users currently have the app open. */
  async online(userIds: string[]): Promise<string[]> {
    const now = Date.now();
    const redis = isRedisReady() ? getRedis() : null;
    if (redis && userIds.length) {
      const values = await redis.hmget(PRESENCE_KEY, ...userIds).catch(() => null);
      if (values) return userIds.filter((_, i) => values[i] && now - Number(values[i]) < PRESENCE_TTL_MS);
    }
    return userIds.filter((id) => sockets.has(id) || now - (memoryPresence.get(id) || 0) < PRESENCE_TTL_MS);
  },

  isConnectedHere: (userId: string) => sockets.has(userId),
};

function startSubscriber() {
  if (!env.redisUrl) return;
  subscriber = new Redis(env.redisUrl, { maxRetriesPerRequest: null });
  subscriber.on('error', () => undefined);
  subscriber.subscribe(CHANNEL).catch(() => undefined);
  subscriber.on('message', (_channel, raw) => {
    try {
      const { userIds, event } = JSON.parse(raw);
      deliverLocally(userIds, event);
    } catch {
      /* ignore malformed messages */
    }
  });
}

/** Presence changes are broadcast to users who share a workspace; resolved lazily to avoid an import cycle. */
let presenceListener: ((userId: string, online: boolean) => void) | null = null;
export const onPresenceChange = (fn: (userId: string, online: boolean) => void) => (presenceListener = fn);

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
    const first = !sockets.has(userId);
    if (first) sockets.set(userId, new Set());
    sockets.get(userId)!.add(ws);
    ws.alive = true;
    markPresence(userId, true);
    if (first) presenceListener?.(userId, true);
    ws.send(JSON.stringify({ type: 'hello', payload: { userId, time: Date.now() } }));

    ws.on('pong', () => {
      ws.alive = true;
      markPresence(userId, true);
    });
    ws.on('message', (raw) => {
      try {
        const message = JSON.parse(raw.toString());
        if (message.type === 'ping') return ws.send(JSON.stringify({ type: 'pong', payload: Date.now() }));
        clientHandlers.get(message.type)?.(userId, message);
      } catch {
        /* ignore malformed client messages */
      }
    });
    ws.on('close', () => {
      const set = sockets.get(userId);
      set?.delete(ws);
      if (set && !set.size) {
        sockets.delete(userId);
        markPresence(userId, false);
        presenceListener?.(userId, false);
      }
    });
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
