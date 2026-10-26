import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { exampleController } from './example.controller';
import { createExampleSchema, updateExampleSchema } from './example.schema';

export const exampleRoutes = Router();

exampleRoutes.post('/', validateBody(createExampleSchema), exampleController.create);
exampleRoutes.get('/:id', exampleController.get);
exampleRoutes.put('/:id', validateBody(updateExampleSchema), exampleController.update);
exampleRoutes.delete('/:id', exampleController.remove);
exampleRoutes.post('/:id/duplicate', exampleController.duplicate);
