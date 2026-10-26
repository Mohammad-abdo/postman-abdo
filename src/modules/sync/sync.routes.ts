import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { syncController } from './sync.controller';
import { heartbeatSchema, historyEntrySchema } from './sync.schema';

/** Offline sync support: device heartbeats and uploads of work done on a device. */
export const syncRoutes = Router();

syncRoutes.post('/heartbeat', validateBody(heartbeatSchema), syncController.heartbeat);
syncRoutes.get('/devices', syncController.devices);
syncRoutes.post('/history', validateBody(historyEntrySchema), syncController.recordHistory);
