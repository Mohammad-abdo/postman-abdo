import 'express-async-errors';
import express, { NextFunction, Request, Response, Router } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { cache } from './core/cache/cache.service';
import { isRedisReady } from './core/cache/redis';
import { prisma } from './core/database/prisma';
import { requireAuth } from './core/middleware/auth.middleware';
import { errorHandler } from './core/middleware/error.middleware';
import { idempotency } from './core/middleware/idempotency.middleware';
import { rateLimits } from './core/security/rate-limit.middleware';
import { applySecurity } from './core/security/security.middleware';
import { accountRoutes } from './modules/account/account.routes';
import { adminRoutes } from './modules/admin/admin.routes';
import { authRoutes } from './modules/auth/auth.routes';
import { codegenRoutes } from './modules/codegen/codegen.routes';
import { collectionRoutes } from './modules/collections/collection.routes';
import { cookieRoutes } from './modules/cookies/cookie.routes';
import { environmentRoutes } from './modules/environments/environment.routes';
import { exampleRoutes } from './modules/examples/example.routes';
import { executionRoutes } from './modules/execution/execution.routes';
import { fileRoutes } from './modules/files/file.routes';
import { folderRoutes } from './modules/folders/folder.routes';
import { historyRoutes } from './modules/history/history.routes';
import { mockRoutes, mockServeRoutes } from './modules/mocks/mock.routes';
import { monitorRoutes } from './modules/monitors/monitor.routes';
import { platformService } from './modules/platform/platform.service';
import { projectRoutes } from './modules/projects/project.routes';
import { requestRoutes } from './modules/requests/request.routes';
import { syncRoutes } from './modules/sync/sync.routes';
import { transferRoutes } from './modules/transfer/transfer.routes';
import { workspaceRoutes } from './modules/workspaces/workspace.routes';

/** While maintenance mode is on only staff can use the API. */
async function maintenanceGate(req: Request, res: Response, next: NextFunction) {
  if (req.auth?.role === 'admin' || req.auth?.role === 'staff') return next();
  if ((await platformService.settings()).maintenanceMode) {
    return res.status(503).json({ error: 'The service is under maintenance. Please try again soon.', maintenance: true });
  }
  next();
}

function apiRouter() {
  const api = Router();
  api.use(rateLimits.global());

  api.get('/health', async (_req, res) => {
    const db = await prisma.$queryRaw`SELECT 1`.then(() => 'ok').catch(() => 'down');
    res.json({ ok: db === 'ok', db, cache: cache.backend(), redis: isRedisReady() ? 'ok' : env.redisUrl ? 'down' : 'disabled' });
  });
  api.use('/auth/login', rateLimits.auth());
  api.use('/auth/register', rateLimits.auth());
  api.use('/auth', authRoutes);

  const authed = Router();
  authed.use(requireAuth, idempotency);
  authed.use('/admin', adminRoutes);
  authed.use(maintenanceGate);
  authed.use('/execute', rateLimits.execute());

  const modules: [string, Router][] = [
    ['/account', accountRoutes],
    ['/workspaces', workspaceRoutes],
    ['/projects', projectRoutes],
    ['/collections', collectionRoutes],
    ['/folders', folderRoutes],
    ['/requests', requestRoutes],
    ['/examples', exampleRoutes],
    ['/environments', environmentRoutes],
    ['/history', historyRoutes],
    ['/cookies', cookieRoutes],
    ['/execute', executionRoutes],
    ['/codegen', codegenRoutes],
    ['/transfer', transferRoutes],
    ['/files', fileRoutes],
    ['/mocks', mockRoutes],
    ['/monitors', monitorRoutes],
    ['/sync', syncRoutes],
  ];
  modules.forEach(([prefix, router]) => authed.use(prefix, router));
  api.use(authed);
  return api;
}

export function createApp() {
  const app = express();
  applySecurity(app);
  // Mock endpoints receive arbitrary bodies, so they are mounted before the JSON parser.
  app.use('/mock', rateLimits.mock(), mockServeRoutes);
  app.use(express.json({ limit: '25mb' }));
  app.use('/api', apiRouter());

  if (fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist, { maxAge: '1h', index: false }));
    app.get(/^(?!\/(api|mock|ws-proxy)).*/, (_req, res) => res.sendFile(path.join(env.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
