import { Router } from 'express';
import { z } from 'zod';
import { validateBody } from '../../core/middleware/validate.middleware';
import { historyController } from './history.controller';

export const historyRoutes = Router();

historyRoutes.get('/', historyController.list);
historyRoutes.delete('/', historyController.clear);
historyRoutes.post('/delete', validateBody(z.object({ ids: z.array(z.string()).min(1) })), historyController.removeMany);
