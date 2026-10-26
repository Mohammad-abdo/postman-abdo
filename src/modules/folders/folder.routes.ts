import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { folderController } from './folder.controller';
import { createFolderSchema, moveFolderSchema, updateFolderSchema } from './folder.schema';

export const folderRoutes = Router();

folderRoutes.post('/', validateBody(createFolderSchema), folderController.create);
folderRoutes.get('/:id', folderController.get);
folderRoutes.put('/:id', validateBody(updateFolderSchema), folderController.update);
folderRoutes.delete('/:id', folderController.remove);
folderRoutes.post('/:id/duplicate', folderController.duplicate);
folderRoutes.post('/:id/move', validateBody(moveFolderSchema), folderController.move);
