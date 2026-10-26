import Redis from 'ioredis';
import { env } from '../../config/env';

let client: Redis | null = null;
let ready = false;

/** Shared Redis connection, or null when REDIS_URL is not configured / unreachable. */
export function getRedis(): Redis | null {
  if (!env.redisUrl) return null;
  if (!client) {
    client = new Redis(env.redisUrl, { lazyConnect: false, maxRetriesPerRequest: 2, enableOfflineQueue: false });
    client.on('ready', () => {
      ready = true;
      console.log('Redis connected');
    });
    client.on('error', (e) => {
      if (ready) console.error('Redis error:', e.message);
      ready = false;
    });
    client.on('end', () => (ready = false));
  }
  return client;
}

export const isRedisReady = () => ready;
