import { Router } from 'express';
import fs from 'fs';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { env } from '../../config/env';
import { rateLimits } from '../../core/security/rate-limit.middleware';
import { fileController } from './file.controller';

fs.mkdirSync(env.uploadDir, { recursive: true });

/** Stored as `<uuid>__<original name>` so the original name can be recovered for downloads. */
const upload = multer({
  storage: multer.diskStorage({
    destination: env.uploadDir,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}__${file.originalname.replace(/[^\w.\- ]+/g, '_')}`),
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
});

export const fileRoutes = Router();

fileRoutes.post('/', rateLimits.upload(), upload.single('file'), fileController.upload);
fileRoutes.get('/:name', fileController.download);
