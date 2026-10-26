import { getRedis, isRedisReady } from './redis';

const PREFIX = 'fp:';
const MAX_MEMORY_ENTRIES = 5000;

/** In-process fallback used when Redis is unavailable. */
const memory = new Map<string, { value: string; expiresAt: number }>();

function memoryGet(key: string) {
  const hit = memory.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    memory.delete(key);
    return null;
  }
  return hit.value;
}

function memorySet(key: string, value: string, ttlSeconds: number) {
  if (memory.size >= MAX_MEMORY_ENTRIES) memory.delete(memory.keys().next().value as string);
  memory.set(key, { value, expiresAt: Date.now() + ttlSeconds * 1000 });
}

const redis = () => (isRedisReady() ? getRedis() : null);

/**
 * JSON cache with TTL. Keys are namespaced so a whole group can be invalidated,
 * e.g. `cache.invalidate('tree:<workspaceId>')`.
 */
export const cache = {
  async get<T>(key: string): Promise<T | null> {
    const raw = redis() ? await redis()!.get(PREFIX + key).catch(() => null) : memoryGet(key);
    return raw ? (JSON.parse(raw) as T) : null;
  },

  async set(key: string, value: unknown, ttlSeconds = 60) {
    const raw = JSON.stringify(value, (_k, v) => (typeof v === 'bigint' ? Number(v) : v));
    if (redis()) await redis()!.set(PREFIX + key, raw, 'EX', ttlSeconds).catch(() => undefined);
    else memorySet(key, raw, ttlSeconds);
  },

  /** Deletes a key and every key starting with `${key}:`. */
  async invalidate(key: string) {
    memory.delete(key);
    for (const k of memory.keys()) if (k.startsWith(`${key}:`)) memory.delete(k);
    const r = redis();
    if (!r) return;
    await r.del(PREFIX + key).catch(() => undefined);
    const stream = r.scanStream({ match: `${PREFIX}${key}:*`, count: 200 });
    for await (const keys of stream) if ((keys as string[]).length) await r.del(...(keys as string[])).catch(() => undefined);
  },

  /** Read-through helper: returns the cached value or computes and stores it. */
  async wrap<T>(key: string, ttlSeconds: number, compute: () => Promise<T>): Promise<T> {
    const hit = await this.get<T>(key);
    if (hit !== null) return hit;
    const value = await compute();
    await this.set(key, value, ttlSeconds);
    return value;
  },

  backend: () => (redis() ? 'redis' : 'memory'),
};

export const cacheKeys = {
  tree: (workspaceId: string) => `tree:${workspaceId}`,
  user: (userId: string) => `user:${userId}`,
  settings: () => 'platform:settings',
  adminOverview: () => 'admin:overview',
};
