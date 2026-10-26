import { Router } from 'express';
import multer from 'multer';
import { validateBody } from '../../core/middleware/validate.middleware';
import { transferController } from './transfer.controller';
import { importSchema, parseCurlSchema } from './transfer.schema';

const inMemory = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });

export const transferRoutes = Router();

transferRoutes.post('/import', validateBody(importSchema), transferController.importText);
transferRoutes.post('/import/files', inMemory.array('files'), transferController.importFiles);
transferRoutes.post('/curl', validateBody(parseCurlSchema), transferController.parseCurl);
transferRoutes.get('/export/:workspaceId', transferController.exportWorkspace);
