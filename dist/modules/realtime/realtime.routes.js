"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realtimeRoutes = void 0;
const express_1 = require("express");
const zod_1 = require("zod");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const realtime_hub_1 = require("./realtime.hub");
const HEARTBEAT_MS = 20_000;
/**
 * HTTP fallback for the real-time channel, for networks/proxies that block WebSockets:
 * - GET  /api/realtime/stream?token=…  → Server-Sent Events with the same events as /ws
 * - POST /api/realtime/send            → client → server messages (e.g. typing)
 */
exports.realtimeRoutes = (0, express_1.Router)();
exports.realtimeRoutes.get('/stream', (req, res) => {
    const userId = (0, auth_middleware_1.currentUserId)(req);
    res.status(200);
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    // Tell nginx/Apache-style buffering proxies to pass every event through immediately.
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    res.write('retry: 3000\n\n');
    const unregister = (0, realtime_hub_1.registerConnection)(userId, { send: (data) => res.write(`data: ${data}\n\n`) });
    // Comments keep idle proxies from closing the stream and keep presence fresh.
    const heartbeat = setInterval(() => {
        res.write(`: ping ${Date.now()}\n\n`);
        realtime_hub_1.realtime.touch(userId);
    }, HEARTBEAT_MS);
    req.on('close', () => {
        clearInterval(heartbeat);
        unregister();
    });
});
exports.realtimeRoutes.post('/send', (0, validate_middleware_1.validateBody)(zod_1.z.object({ type: zod_1.z.string().min(1).max(64), payload: zod_1.z.unknown().optional() })), (req, res) => {
    realtime_hub_1.realtime.receive((0, auth_middleware_1.currentUserId)(req), req.body);
    res.status(202).json({ ok: true });
});
