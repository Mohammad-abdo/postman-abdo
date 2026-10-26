import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../../config/env';
import { AuthContext, Permission, hasPermission } from '../auth/permissions';
import { cache, cacheKeys } from '../cache/cache.service';
import { prisma } from '../database/prisma';
import { Forbidden, Unauthorized } from '../errors/http-error';

interface TokenPayload {
  sub: string;
  /** User.tokenVersion at signing time; bumping it revokes the token. */
  v: number;
}

interface CachedUser extends AuthContext {
  status: string;
  tokenVersion: number;
}

const USER_CACHE_TTL = 30;
const LAST_SEEN_THROTTLE_MS = 60_000;
const lastSeenWrites = new Map<string, number>();

export function signToken(userId: string, tokenVersion = 0) {
  return jwt.sign({ sub: userId, v: tokenVersion }, env.jwtSecret, { expiresIn: env.jwtExpiresIn as jwt.SignOptions['expiresIn'] });
}

export function verifyToken(token: string): TokenPayload | null {
  try {
    return jwt.verify(token, env.jwtSecret) as unknown as TokenPayload;
  } catch {
    return null;
  }
}

/** Loads (and caches briefly) what every authenticated request needs to know about the user. */
export async function loadAuthUser(userId: string): Promise<CachedUser | null> {
  return cache.wrap(cacheKeys.user(userId), USER_CACHE_TTL, async () => {
    const user = await prisma.user.findUnique({ where: { id: userId }, include: { staffRole: true } });
    if (!user) return null;
    return {
      id: user.id,
      email: user.email,
      role: user.role as CachedUser['role'],
      status: user.status,
      tokenVersion: user.tokenVersion,
      permissions: user.role === 'staff' ? ((user.staffRole?.permissions as Permission[]) || []) : [],
    };
  });
}

export const invalidateAuthUser = (userId: string) => cache.invalidate(cacheKeys.user(userId));

function touchLastSeen(userId: string) {
  const last = lastSeenWrites.get(userId) || 0;
  if (Date.now() - last < LAST_SEEN_THROTTLE_MS) return;
  lastSeenWrites.set(userId, Date.now());
  prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
}

export async function authenticate(token: string): Promise<CachedUser> {
  const payload = token ? verifyToken(token) : null;
  if (!payload) throw Unauthorized();
  const user = await loadAuthUser(payload.sub);
  if (!user || (payload.v ?? 0) !== user.tokenVersion) throw Unauthorized('Session expired, please sign in again');
  if (user.status === 'suspended') throw Forbidden('Your account has been suspended. Contact support.');
  return user;
}

/** Accepts `Authorization: Bearer <token>` or `?token=` (downloads, SSE, websockets). */
export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
  const user = await authenticate(token);
  req.userId = user.id;
  req.auth = user;
  touchLastSeen(user.id);
  next();
}

export const requirePermission = (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
  if (!hasPermission(req.auth, permission)) throw Forbidden('You do not have permission to do this');
  next();
};

/** Staff or admins only (entry to the admin dashboard API). */
export function requireStaff(req: Request, _res: Response, next: NextFunction) {
  if (req.auth?.role !== 'admin' && req.auth?.role !== 'staff') throw Forbidden('Admin access required');
  next();
}

/** The authenticated user id; only valid behind `requireAuth`. */
export const currentUserId = (req: Request) => req.userId as string;
