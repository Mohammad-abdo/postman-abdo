import { NextFunction, Request, Response } from 'express';
import { json, prisma } from '../database/prisma';

const KEY_HEADER = 'idempotency-key';
const MAX_KEY_LENGTH = 120;

/**
 * Offline clients replay queued writes with an `Idempotency-Key` header.
 * The first successful response is stored; a replay returns it instead of applying the write twice.
 */
export async function idempotency(req: Request, res: Response, next: NextFunction) {
  const rawKey = req.header(KEY_HEADER);
  if (!rawKey || req.method === 'GET' || !req.userId) return next();
  if (rawKey.length > MAX_KEY_LENGTH) return res.status(400).json({ error: 'Idempotency-Key is too long' });

  const key = `${req.userId}:${rawKey}`;
  const existing = await prisma.idempotencyRecord.findUnique({ where: { key } });
  if (existing) {
    res.setHeader('Idempotent-Replay', 'true');
    return res.status(existing.status).json(existing.response);
  }

  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    if (res.statusCode < 500) {
      prisma.idempotencyRecord
        .create({ data: { key, userId: req.userId!, method: req.method, path: req.originalUrl, status: res.statusCode, response: json(body ?? null) } })
        .catch(() => undefined);
    }
    return originalJson(body);
  };
  next();
}

/** Housekeeping: idempotency records only need to outlive the longest offline period. */
export function pruneIdempotencyRecords(days = 30) {
  return prisma.idempotencyRecord.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - days * 86_400_000) } } });
}
