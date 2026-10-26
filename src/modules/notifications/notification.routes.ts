import { randomUUID } from 'crypto';
import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { requirePermission, requireStaff } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { notificationController, notificationAdminController } from './notification.controller';
import { NOTIFICATION_CATEGORIES } from './notification.types';
import { SOUNDS_DIR } from './sound.service';

const MAX_SOUND_BYTES = 2 * 1024 * 1024;

export const notificationRoutes = Router();

notificationRoutes.get('/', notificationController.list);
notificationRoutes.get('/unread-count', notificationController.unreadCount);
notificationRoutes.get('/sounds', notificationController.sounds);
notificationRoutes.post('/read', validateBody(z.object({ ids: z.array(z.string()).optional() })), notificationController.markRead);
notificationRoutes.delete('/', notificationController.clear);
notificationRoutes.delete('/:id', notificationController.remove);

const upload = multer({
  storage: multer.diskStorage({
    destination: SOUNDS_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '')}`),
  }),
  limits: { fileSize: MAX_SOUND_BYTES },
});

const soundUpdateSchema = z.object({
  name: z.string().trim().min(1).max(80).optional(),
  events: z.array(z.enum(Object.keys(NOTIFICATION_CATEGORIES) as [string, ...string[]])).optional(),
  isDefault: z.boolean().optional(),
  volume: z.number().min(0).max(1).optional(),
});

/** Mounted at /api/admin/sounds. */
export const soundAdminRoutes = Router();
soundAdminRoutes.use(requireStaff, requirePermission('notifications.manage'));
soundAdminRoutes.get('/', notificationAdminController.list);
soundAdminRoutes.post('/', upload.single('file'), notificationAdminController.upload);
soundAdminRoutes.put('/:id', validateBody(soundUpdateSchema), notificationAdminController.update);
soundAdminRoutes.delete('/:id', notificationAdminController.remove);

const broadcastSchema = z.object({
  title: z.string().trim().min(1).max(160),
  body: z.string().trim().max(2000).optional(),
  workspaceId: z.string().optional(),
});

/** Mounted at /api/admin/broadcast. */
export const broadcastAdminRoutes = Router();
broadcastAdminRoutes.use(requireStaff, requirePermission('notifications.manage'));
broadcastAdminRoutes.post('/', validateBody(broadcastSchema), notificationAdminController.broadcast);

/** Public, cacheable tone files for <audio> elements. */
export const soundFileRoutes = express.static(SOUNDS_DIR, { maxAge: '7d', immutable: true, fallthrough: false });
