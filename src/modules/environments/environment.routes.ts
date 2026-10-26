import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { environmentController } from './environment.controller';
import { createEnvironmentSchema, updateEnvironmentSchema } from './environment.schema';

export const environmentRoutes = Router();

environmentRoutes.get('/', environmentController.list);
environmentRoutes.post('/', validateBody(createEnvironmentSchema), environmentController.create);
environmentRoutes.put('/:id', validateBody(updateEnvironmentSchema), environmentController.update);
environmentRoutes.delete('/:id', environmentController.remove);
environmentRoutes.post('/:id/duplicate', environmentController.duplicate);
environmentRoutes.get('/:id/export', environmentController.export);
