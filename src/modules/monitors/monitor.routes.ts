import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { monitorController } from './monitor.controller';
import { createMonitorSchema, updateMonitorSchema } from './monitor.schema';

export const monitorRoutes = Router();

monitorRoutes.get('/', monitorController.list);
monitorRoutes.post('/', validateBody(createMonitorSchema), monitorController.create);
monitorRoutes.put('/:id', validateBody(updateMonitorSchema), monitorController.update);
monitorRoutes.delete('/:id', monitorController.remove);
monitorRoutes.post('/:id/run', monitorController.runNow);
monitorRoutes.get('/:id/runs', monitorController.runs);
