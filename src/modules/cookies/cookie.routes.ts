import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../core/middleware/validate.middleware';
import { cookieController } from './cookie.controller';

const upsertSchema = z.object({ domain: z.string().trim().min(1), raw: z.string().optional() });
const removeSchema = z.object({ domain: z.string().min(1), name: z.string().optional(), path: z.string().optional() });

export const cookieRoutes = Router();

cookieRoutes.get('/', cookieController.list);
cookieRoutes.post('/', validateBody(upsertSchema), cookieController.upsert);
cookieRoutes.post('/delete', validateBody(removeSchema), cookieController.remove);
cookieRoutes.delete('/', cookieController.clear);
