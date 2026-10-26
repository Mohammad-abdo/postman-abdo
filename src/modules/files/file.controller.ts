import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { BadRequest, NotFound } from '../../core/errors/http-error';
import { limitsService } from '../platform/limits.service';

/** Files attached to form-data / binary bodies. Every upload is tracked per user for quotas and the admin dashboard. */
export const fileController = {
  upload: async (req: Request, res: Response) => {
    if (!req.file) throw BadRequest('No file uploaded');
    const userId = currentUserId(req);
    try {
      await limitsService.assertCanUpload(userId, req.file.size);
    } catch (e) {
      fs.rm(req.file.path, () => undefined);
      throw e;
    }
    await prisma.uploadedFile.create({
      data: {
        userId,
        workspaceId: typeof req.body.workspaceId === 'string' ? req.body.workspaceId : null,
        storedName: req.file.filename,
        originalName: req.file.originalname,
        mimeType: req.file.mimetype,
        size: req.file.size,
      },
    });
    res.json({ src: req.file.filename, name: req.file.originalname, size: req.file.size });
  },

  download: (req: Request, res: Response) => {
    const stored = path.basename(req.params.name);
    const filePath = path.join(env.uploadDir, stored);
    if (!fs.existsSync(filePath)) throw NotFound('File not found');
    res.download(filePath, stored.split('__').slice(1).join('__') || stored);
  },
};
