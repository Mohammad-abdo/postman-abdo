import { NextFunction, Request, Response } from 'express';
import { RateLimiterAbstract, RateLimiterMemory, RateLimiterRedis, RateLimiterRes } from 'rate-limiter-flexible';
import { getRedis } from '../cache/redis';

interface LimiterOptions {
  name: string;
  points: number;
  durationSeconds: number;
  /** Seconds to block after the limit is exceeded (brute-force protection). */
  blockSeconds?: number;
}

/** Redis-backed limiter (shared across instances) with an in-memory insurance limiter. */
function createLimiter({ name, points, durationSeconds, blockSeconds = 0 }: LimiterOptions): RateLimiterAbstract {
  const memory = new RateLimiterMemory({ keyPrefix: `rl:${name}`, points, duration: durationSeconds, blockDuration: blockSeconds });
  const redis = getRedis();
  if (!redis) return memory;
  return new RateLimiterRedis({
    storeClient: redis,
    keyPrefix: `rl:${name}`,
    points,
    duration: durationSeconds,
    blockDuration: blockSeconds,
    insuranceLimiter: memory,
  });
}

type KeyFn = (req: Request) => string;
const byIp: KeyFn = (req) => req.ip || 'unknown';
const byUserOrIp: KeyFn = (req) => req.userId || req.ip || 'unknown';

function middleware(limiter: RateLimiterAbstract, keyFn: KeyFn, message: string) {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await limiter.consume(keyFn(req));
      res.setHeader('RateLimit-Limit', String(limiter.points));
      res.setHeader('RateLimit-Remaining', String(result.remainingPoints));
      next();
    } catch (e) {
      if (!(e instanceof RateLimiterRes)) return next(); // store failure: fail open
      res.setHeader('Retry-After', String(Math.ceil(e.msBeforeNext / 1000)));
      res.status(429).json({ error: message, retryAfter: Math.ceil(e.msBeforeNext / 1000) });
    }
  };
}

/** Rate limit policies. Created lazily so Redis is configured first. */
export const rateLimits = {
  /** Every API call, per IP. */
  global: () => middleware(createLimiter({ name: 'global', points: 600, durationSeconds: 60 }), byIp, 'Too many requests, slow down.'),
  /** Login/registration brute-force protection, per IP. */
  auth: () =>
    middleware(createLimiter({ name: 'auth', points: 10, durationSeconds: 60, blockSeconds: 300 }), byIp, 'Too many sign-in attempts. Try again in a few minutes.'),
  /** Request execution (Send / Runner), per user. */
  execute: () => middleware(createLimiter({ name: 'execute', points: 120, durationSeconds: 60 }), byUserOrIp, 'Too many requests sent. Wait a moment and try again.'),
  /** Public mock endpoints, per IP. */
  mock: () => middleware(createLimiter({ name: 'mock', points: 300, durationSeconds: 60 }), byIp, 'Mock server rate limit exceeded.'),
  /** File uploads and imports, per user. */
  upload: () => middleware(createLimiter({ name: 'upload', points: 30, durationSeconds: 60 }), byUserOrIp, 'Too many uploads. Try again later.'),
};
