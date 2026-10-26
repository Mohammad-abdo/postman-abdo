import 'express-async-errors';
import express, { Router } from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { env } from './config/env';
import { requireAuth } from './core/middleware/auth.middleware';
import { errorHandler } from './core/middleware/error.middleware';
import { authRoutes } from './modules/auth/auth.routes';
import { workspaceRoutes } from './modules/workspaces/workspace.routes';
import { collectionRoutes } from './modules/collections/collection.routes';
import { folderRoutes } from './modules/folders/folder.routes';
import { requestRoutes } from './modules/requests/request.routes';
import { exampleRoutes } from './modules/examples/example.routes';
import { environmentRoutes } from './modules/environments/environment.routes';
import { historyRoutes } from './modules/history/history.routes';
import { cookieRoutes } from './modules/cookies/cookie.routes';
import { executionRoutes } from './modules/execution/execution.routes';
import { codegenRoutes } from './modules/codegen/codegen.routes';
import { transferRoutes } from './modules/transfer/transfer.routes';
import { fileRoutes } from './modules/files/file.routes';
import { mockRoutes, mockServeRoutes } from './modules/mocks/mock.routes';
import { monitorRoutes } from './modules/monitors/monitor.routes';

function apiRouter() {
  const api = Router();
  api.get('/health', (_req, res) => res.json({ ok: true }));
  api.use('/auth', authRoutes);

  const secured: [string, Router][] = [
    ['/workspaces', workspaceRoutes],
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
  ];
  secured.forEach(([prefix, router]) => api.use(prefix, requireAuth, router));
  return api;
}

export function createApp() {
  const app = express();
  app.use(cors());
  // Mock endpoints receive arbitrary bodies, so they are mounted before the JSON parser.
  app.use('/mock', mockServeRoutes);
  app.use(express.json({ limit: '100mb' }));
  app.use('/api', apiRouter());

  if (fs.existsSync(env.clientDist)) {
    app.use(express.static(env.clientDist));
    app.get(/^(?!\/(api|mock|ws-proxy)).*/, (_req, res) => res.sendFile(path.join(env.clientDist, 'index.html')));
  }

  app.use(errorHandler);
  return app;
}
