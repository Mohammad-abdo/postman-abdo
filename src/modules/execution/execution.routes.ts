import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { executionController } from './execution.controller';
import { runCollectionSchema, sendRequestSchema } from './execution.schema';

export const executionRoutes = Router();

executionRoutes.post('/send', validateBody(sendRequestSchema), executionController.send);
executionRoutes.post('/run', validateBody(runCollectionSchema), executionController.run);
executionRoutes.get('/runs', executionController.listRuns);
executionRoutes.get('/runs/:id', executionController.getRun);
executionRoutes.delete('/runs/:id', executionController.removeRun);
