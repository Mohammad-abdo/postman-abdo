"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.currentUserId = exports.requirePermission = exports.invalidateAuthUser = void 0;
exports.signToken = signToken;
exports.verifyToken = verifyToken;
exports.loadAuthUser = loadAuthUser;
exports.authenticate = authenticate;
exports.requireAuth = requireAuth;
exports.requireStaff = requireStaff;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const permissions_1 = require("../auth/permissions");
const cache_service_1 = require("../cache/cache.service");
const prisma_1 = require("../database/prisma");
const http_error_1 = require("../errors/http-error");
const USER_CACHE_TTL = 30;
const LAST_SEEN_THROTTLE_MS = 60_000;
const lastSeenWrites = new Map();
function signToken(userId, tokenVersion = 0) {
    return jsonwebtoken_1.default.sign({ sub: userId, v: tokenVersion }, env_1.env.jwtSecret, { expiresIn: env_1.env.jwtExpiresIn });
}
function verifyToken(token) {
    try {
        return jsonwebtoken_1.default.verify(token, env_1.env.jwtSecret);
    }
    catch {
        return null;
    }
}
/** Loads (and caches briefly) what every authenticated request needs to know about the user. */
async function loadAuthUser(userId) {
    return cache_service_1.cache.wrap(cache_service_1.cacheKeys.user(userId), USER_CACHE_TTL, async () => {
        const user = await prisma_1.prisma.user.findUnique({ where: { id: userId }, include: { staffRole: true } });
        if (!user)
            return null;
        return {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
            tokenVersion: user.tokenVersion,
            permissions: user.role === 'staff' ? (user.staffRole?.permissions || []) : [],
        };
    });
}
const invalidateAuthUser = (userId) => cache_service_1.cache.invalidate(cache_service_1.cacheKeys.user(userId));
exports.invalidateAuthUser = invalidateAuthUser;
function touchLastSeen(userId) {
    const last = lastSeenWrites.get(userId) || 0;
    if (Date.now() - last < LAST_SEEN_THROTTLE_MS)
        return;
    lastSeenWrites.set(userId, Date.now());
    prisma_1.prisma.user.update({ where: { id: userId }, data: { lastSeenAt: new Date() } }).catch(() => undefined);
}
async function authenticate(token) {
    const payload = token ? verifyToken(token) : null;
    if (!payload)
        throw (0, http_error_1.Unauthorized)();
    const user = await loadAuthUser(payload.sub);
    if (!user || (payload.v ?? 0) !== user.tokenVersion)
        throw (0, http_error_1.Unauthorized)('Session expired, please sign in again');
    if (user.status === 'suspended')
        throw (0, http_error_1.Forbidden)('Your account has been suspended. Contact support.');
    return user;
}
/** Accepts `Authorization: Bearer <token>` or `?token=` (downloads, SSE, websockets). */
async function requireAuth(req, _res, next) {
    const header = req.headers.authorization || '';
    const token = header.startsWith('Bearer ') ? header.slice(7) : String(req.query.token || '');
    const user = await authenticate(token);
    req.userId = user.id;
    req.auth = user;
    touchLastSeen(user.id);
    next();
}
const requirePermission = (permission) => (req, _res, next) => {
    if (!(0, permissions_1.hasPermission)(req.auth, permission))
        throw (0, http_error_1.Forbidden)('You do not have permission to do this');
    next();
};
exports.requirePermission = requirePermission;
/** Staff or admins only (entry to the admin dashboard API). */
function requireStaff(req, _res, next) {
    if (req.auth?.role !== 'admin' && req.auth?.role !== 'staff')
        throw (0, http_error_1.Forbidden)('Admin access required');
    next();
}
/** The authenticated user id; only valid behind `requireAuth`. */
const currentUserId = (req) => req.userId;
exports.currentUserId = currentUserId;
