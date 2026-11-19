"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtime = exports.onPresenceChange = void 0;
exports.registerConnection = registerConnection;
exports.attachRealtime = attachRealtime;
const crypto_1 = require("crypto");
const ioredis_1 = __importDefault(require("ioredis"));
const ws_1 = __importStar(require("ws"));
const env_1 = require("../../config/env");
const redis_1 = require("../../core/cache/redis");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const PATH = '/ws';
const CHANNEL = 'fp:realtime';
const PRESENCE_KEY = 'fp:presence';
const PRESENCE_TTL_MS = 70_000;
const PING_INTERVAL_MS = 30_000;
/** Lets an instance ignore its own pub/sub messages (it already delivered them locally). */
const INSTANCE_ID = (0, crypto_1.randomUUID)();
const connections = new Map();
const clientHandlers = new Map();
const memoryPresence = new Map();
let subscriber = null;
function deliverLocally(userIds, event) {
    const data = JSON.stringify(event);
    userIds.forEach((id) => connections.get(id)?.forEach((c) => {
        try {
            c.send(data);
        }
        catch {
            /* a dying connection is cleaned up by its close handler */
        }
    }));
}
async function markPresence(userId, online) {
    if (online)
        memoryPresence.set(userId, Date.now());
    else
        memoryPresence.delete(userId);
    const redis = (0, redis_1.isRedisReady)() ? (0, redis_1.getRedis)() : null;
    if (!redis)
        return;
    if (online)
        await redis.hset(PRESENCE_KEY, userId, String(Date.now())).catch(() => undefined);
    else
        await redis.hdel(PRESENCE_KEY, userId).catch(() => undefined);
}
/** Presence changes are broadcast to users who share a workspace; resolved lazily to avoid an import cycle. */
let presenceListener = null;
const onPresenceChange = (fn) => (presenceListener = fn);
exports.onPresenceChange = onPresenceChange;
/** Registers a connection for a user; returns the function to call when it closes. */
function registerConnection(userId, connection) {
    const first = !connections.has(userId);
    if (first)
        connections.set(userId, new Set());
    connections.get(userId).add(connection);
    markPresence(userId, true);
    if (first)
        presenceListener?.(userId, true);
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
exports.realtime = {
    /** Sends an event to every open connection of the given users (on every instance). */
    emit(userIds, type, payload) {
        const ids = [...new Set(Array.isArray(userIds) ? userIds : [userIds])].filter(Boolean);
        if (!ids.length)
            return;
        const event = { type, payload };
        deliverLocally(ids, event);
        const redis = (0, redis_1.isRedisReady)() ? (0, redis_1.getRedis)() : null;
        if (redis && subscriber)
            redis.publish(CHANNEL, JSON.stringify({ origin: INSTANCE_ID, userIds: ids, event })).catch(() => undefined);
    },
    /** Handles a message sent by a client (WebSocket frame or POST /api/realtime/send). */
    receive(userId, message) {
        clientHandlers.get(message.type)?.(userId, message);
    },
    /** Registers a handler for messages sent by clients (e.g. "typing"). */
    on(type, handler) {
        clientHandlers.set(type, handler);
    },
    /** Keeps a user marked online (SSE heartbeats). */
    touch: (userId) => markPresence(userId, true),
    /** Which of these users currently have the app open. */
    async online(userIds) {
        const now = Date.now();
        const redis = (0, redis_1.isRedisReady)() ? (0, redis_1.getRedis)() : null;
        if (redis && userIds.length) {
            const values = await redis.hmget(PRESENCE_KEY, ...userIds).catch(() => null);
            if (values)
                return userIds.filter((_, i) => values[i] && now - Number(values[i]) < PRESENCE_TTL_MS);
        }
        return userIds.filter((id) => connections.has(id) || now - (memoryPresence.get(id) || 0) < PRESENCE_TTL_MS);
    },
    isConnectedHere: (userId) => connections.has(userId),
};
function startSubscriber() {
    if (!env_1.env.redisUrl)
        return;
    subscriber = new ioredis_1.default(env_1.env.redisUrl, { maxRetriesPerRequest: null });
    subscriber.on('error', () => undefined);
    subscriber.subscribe(CHANNEL).catch(() => undefined);
    subscriber.on('message', (_channel, raw) => {
        try {
            const { origin, userIds, event } = JSON.parse(raw);
            if (origin !== INSTANCE_ID)
                deliverLocally(userIds, event);
        }
        catch {
            /* ignore malformed messages */
        }
    });
}
function attachRealtime(server) {
    startSubscriber();
    const wss = new ws_1.WebSocketServer({ noServer: true, maxPayload: 64 * 1024 });
    server.on('upgrade', async (req, socket, head) => {
        const url = new URL(req.url || '', 'http://localhost');
        if (url.pathname !== PATH)
            return;
        try {
            const user = await (0, auth_middleware_1.authenticate)(url.searchParams.get('token') || '');
            wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, user.id));
        }
        catch {
            socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
            socket.destroy();
        }
    });
    wss.on('connection', (ws, userId) => {
        ws.alive = true;
        const unregister = registerConnection(userId, { send: (data) => ws.readyState === ws_1.default.OPEN && ws.send(data) });
        ws.on('pong', () => {
            ws.alive = true;
            markPresence(userId, true);
        });
        ws.on('message', (raw) => {
            try {
                const message = JSON.parse(raw.toString());
                if (message.type === 'ping')
                    return ws.send(JSON.stringify({ type: 'pong', payload: Date.now() }));
                exports.realtime.receive(userId, message);
            }
            catch {
                /* ignore malformed client messages */
            }
        });
        ws.on('close', unregister);
    });
    // Drop dead connections (laptops going to sleep, flaky mobile networks).
    setInterval(() => {
        wss.clients.forEach((ws) => {
            if (!ws.alive)
                return ws.terminate();
            ws.alive = false;
            ws.ping();
        });
    }, PING_INTERVAL_MS).unref();
}
