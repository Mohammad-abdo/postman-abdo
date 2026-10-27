import { randomUUID } from 'crypto';
import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { env } from '../../config/env';

export const CHAT_UPLOAD_DIR = path.join(env.uploadDir, 'chat');
fs.mkdirSync(CHAT_UPLOAD_DIR, { recursive: true });

/** Stored under a random name; the extension is kept (sanitised) so downloads open with the right app. */
export const chatUpload = multer({
  storage: multer.diskStorage({
    destination: CHAT_UPLOAD_DIR,
    filename: (_req, file, cb) => cb(null, `${randomUUID()}${path.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 12)}`),
  }),
  limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
