import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { collectionController } from './collection.controller';
import { createCollectionSchema, positionSchema, updateCollectionSchema } from './collection.schema';

export const collectionRoutes = Router();

collectionRoutes.post('/', validateBody(createCollectionSchema), collectionController.create);
collectionRoutes.get('/trash/:workspaceId', collectionController.trash);
collectionRoutes.get('/:id', collectionController.get);
collectionRoutes.put('/:id', validateBody(updateCollectionSchema), collectionController.update);
collectionRoutes.delete('/:id', collectionController.remove);
collectionRoutes.post('/:id/restore', collectionController.restore);
collectionRoutes.delete('/:id/permanent', collectionController.destroy);
collectionRoutes.put('/:id/position', validateBody(positionSchema), collectionController.setPosition);
collectionRoutes.post('/:id/duplicate', collectionController.duplicate);
collectionRoutes.get('/:id/export', collectionController.export);
