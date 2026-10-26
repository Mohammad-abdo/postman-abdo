import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { requestController } from './request.controller';
import { createRequestSchema, moveRequestSchema, updateRequestSchema } from './request.schema';

export const requestRoutes = Router();

requestRoutes.post('/', validateBody(createRequestSchema), requestController.create);
requestRoutes.get('/:id', requestController.get);
requestRoutes.put('/:id', validateBody(updateRequestSchema), requestController.update);
requestRoutes.delete('/:id', requestController.remove);
requestRoutes.post('/:id/duplicate', requestController.duplicate);
requestRoutes.post('/:id/move', validateBody(moveRequestSchema), requestController.move);
