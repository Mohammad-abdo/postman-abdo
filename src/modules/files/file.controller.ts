import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { BadRequest, NotFound } from '../../core/errors/http-error';

/** Files attached to form-data / binary bodies. */
export const fileController = {
  upload: (req: Request, res: Response) => {
    if (!req.file) throw BadRequest('No file uploaded');
    res.json({ src: req.file.filename, name: req.file.originalname, size: req.file.size });
  },

  download: (req: Request, res: Response) => {
    const stored = path.basename(req.params.name);
    const filePath = path.join(env.uploadDir, stored);
    if (!fs.existsSync(filePath)) throw NotFound('File not found');
    res.download(filePath, stored.split('__').slice(1).join('__') || stored);
  },
};
