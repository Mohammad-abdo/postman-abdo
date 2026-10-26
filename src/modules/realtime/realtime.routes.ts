import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { realtime, registerConnection } from './realtime.hub';

const HEARTBEAT_MS = 20_000;

/**
 * HTTP fallback for the real-time channel, for networks/proxies that block WebSockets:
 * - GET  /api/realtime/stream?token=…  → Server-Sent Events with the same events as /ws
 * - POST /api/realtime/send            → client → server messages (e.g. typing)
 */
export const realtimeRoutes = Router();

realtimeRoutes.get('/stream', (req: Request, res: Response) => {
  const userId = currentUserId(req);
  res.status(200);
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  // Tell nginx/Apache-style buffering proxies to pass every event through immediately.
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 3000\n\n');

  const unregister = registerConnection(userId, { send: (data) => res.write(`data: ${data}\n\n`) });
  // Comments keep idle proxies from closing the stream and keep presence fresh.
  const heartbeat = setInterval(() => {
    res.write(`: ping ${Date.now()}\n\n`);
    realtime.touch(userId);
  }, HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unregister();
  });
});

realtimeRoutes.post('/send', validateBody(z.object({ type: z.string().min(1).max(64), payload: z.unknown().optional() })), (req: Request, res: Response) => {
  realtime.receive(currentUserId(req), req.body);
  res.status(202).json({ ok: true });
});
