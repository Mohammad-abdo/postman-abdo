import express, { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { mockController } from './mock.controller';
import { createMockSchema, updateMockSchema } from './mock.schema';

/** Management API (authenticated). */
export const mockRoutes = Router();

mockRoutes.get('/', mockController.list);
mockRoutes.post('/', validateBody(createMockSchema), mockController.create);
mockRoutes.put('/:id', validateBody(updateMockSchema), mockController.update);
mockRoutes.delete('/:id', mockController.remove);

/** Public mock endpoints; accept any body type. */
export const mockServeRoutes = Router();

mockServeRoutes.all('/:mockId*', express.raw({ type: '*/*', limit: '50mb' }), mockController.serve);
