"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.cacheKeys = exports.cache = void 0;
const redis_1 = require("./redis");
const PREFIX = 'fp:';
const MAX_MEMORY_ENTRIES = 5000;
/** In-process fallback used when Redis is unavailable. */
const memory = new Map();
function memoryGet(key) {
    const hit = memory.get(key);
    if (!hit)
        return null;
    if (hit.expiresAt < Date.now()) {
        memory.delete(key);
        return null;
    }
    return hit.value;
}
function memorySet(key, value, ttlSeconds) {
    if (memory.size >= MAX_MEMORY_ENTRIES)
        memory.delete(memory.keys().next().value);
    memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}
const redis = () => ((0, redis_1.isRedisReady)() ? (0, redis_1.getRedis)() : null);
/**
 * JSON cache with TTL. Keys are namespaced so a whole group can be invalidated,
 * e.g. `cache.invalidate('tree:<workspaceId>')`.
 */
exports.cache = {
    async get(key) {
        const raw = redis() ? await redis().get(PREFIX + key).catch(() => null) : memoryGet(key);
        return raw ? JSON.parse(raw) : null;
    },
    async set(key, value, ttlSeconds = 60) {
        const raw = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
        if (redis())
            await redis().set(PREFIX + key, raw, 'EX', ttlSeconds).catch(() => undefined);
        else
            memorySet(key, raw, ttlSeconds);
    },
    /** Deletes a key and every key starting with `${key}:`. */
    async invalidate(key) {
        memory.delete(key);
        for (const k of memory.keys())
            if (k.startsWith(`${key}:`))
                memory.delete(k);
        const r = redis();
        if (!r)
            return;
        await r.del(PREFIX + key).catch(() => undefined);
        const stream = r.scanStream({ match: `${PREFIX}${key}:*`, count: 200 });
        for await (const keys of stream)
            if (keys.length)
                await r.del(...keys).catch(() => undefined);
    },
    /** Read-through helper: returns the cached value or computes and stores it. */
    async wrap(key, ttlSeconds, compute) {
        const hit = await this.get(key);
        if (hit !== null)
            return hit;
        const value = await compute();
        await this.set(key, value, ttlSeconds);
        return value;
    },
    backend: () => (redis() ? 'redis' : 'memory'),
};
exports.cacheKeys = {
    tree: (workspaceId) => `tree:${workspaceId}`,
    user: (userId) => `user:${userId}`,
    settings: () => 'platform:settings',
    adminOverview: () => 'admin:overview',
};
