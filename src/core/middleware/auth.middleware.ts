import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { Unauthorized } from '../errors/http-error';

export function signToken(userId: string) {
  return jwt.sign({ sub: userId }, env.jwtSecret, { expiresIn: env.jwtExpiresIn });
}

export function verifyToken(token: string): string | null {
  try {
    return (jwt.verify(token, env.jwtSecret) as { sub: string }).sub;
  } catch {
    return null;
  }
}

/** Accepts `Authorization: Bearer <token>` or `?token=` (used by downloads and SSE). */
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
  const userId = token ? verifyToken(token) : null;
  if (!userId) throw Unauthorized();
  req.userId = userId;
  next();
}

/** The authenticated user id; only valid behind `requireAuth`. */
export const currentUserId = (req: Request) => req.userId as string;
