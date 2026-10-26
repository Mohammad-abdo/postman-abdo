import { randomUUID } from 'crypto';
import express, { Router } from 'express';
import multer from 'multer';
import path from 'path';
import { z } from 'zod';
import { requirePermission, requireStaff } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { notificationController, soundAdminController } from './notification.controller';
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
soundAdminRoutes.get('/', soundAdminController.list);
soundAdminRoutes.post('/', upload.single('file'), soundAdminController.upload);
soundAdminRoutes.put('/:id', validateBody(soundUpdateSchema), soundAdminController.update);
soundAdminRoutes.delete('/:id', soundAdminController.remove);

/** Public, cacheable tone files for <audio> elements. */
export const soundFileRoutes = express.static(SOUNDS_DIR, { maxAge: '7d', immutable: true, fallthrough: false });
