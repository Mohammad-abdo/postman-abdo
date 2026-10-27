import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../../core/database/prisma';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { BadRequest } from '../../core/errors/http-error';
import { limitsService } from '../platform/limits.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { chatService } from './chat.service';
import { CHAT_UPLOAD_DIR } from './chat.upload';

/** Only these are rendered inline by the browser; anything else (HTML, SVG, scripts…) is always a download. */
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|ogg|wav|webm|mp4|aac|x-m4a|m4a|flac))$/i;

export const chatController = {
  list: async (req: Request, res: Response) => res.json(await chatService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  open: async (req: Request, res: Response) => res.json(await chatService.open(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await chatService.update(currentUserId(req), req.params.id, req.body)),
  addMembers: async (req: Request, res: Response) => res.json(await chatService.addMembers(currentUserId(req), req.params.id, req.body.userIds)),
  leave: async (req: Request, res: Response) => res.json(await chatService.leave(currentUserId(req), req.params.id)),
  messages: async (req: Request, res: Response) =>
    res.json(await chatService.messages(currentUserId(req), req.params.id, req.query.before ? String(req.query.before) : undefined)),
  send: async (req: Request, res: Response) => res.json(await chatService.send(currentUserId(req), req.params.id, req.body)),
  markRead: async (req: Request, res: Response) => res.json(await chatService.markRead(currentUserId(req), req.params.id)),
  edit: async (req: Request, res: Response) => res.json(await chatService.edit(currentUserId(req), req.params.id, req.body.body)),
  remove: async (req: Request, res: Response) => res.json(await chatService.remove(currentUserId(req), req.params.id)),
  react: async (req: Request, res: Response) => res.json(await chatService.react(currentUserId(req), req.params.id, req.body.emoji)),
  presence: async (req: Request, res: Response) => res.json(await chatService.presence(currentUserId(req), String(req.query.workspaceId || ''))),

  /** Stores one chat attachment; the client then references it by `file` when sending the message. */
  upload: async (req: Request, res: Response) => {
    if (!req.file) throw BadRequest('No file uploaded');
    const userId = currentUserId(req);
    const workspaceId = String(req.body.workspaceId || '');
    try {
      await assertWorkspaceMember(userId, workspaceId);
      await limitsService.assertCanUpload(userId, req.file.size);
    } catch (e) {
      fs.rm(req.file.path, () => undefined);
      throw e;
    }
    // multer reads names as latin1; restore UTF-8 so Arabic and other non-ASCII names survive.
    const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const mimeType = (req.file.mimetype || 'application/octet-stream').split(';')[0].trim().toLowerCase();
    await prisma.uploadedFile.create({
      data: { userId, workspaceId, storedName: req.file.filename, originalName, mimeType, size: req.file.size },
    });
    res.json({ file: req.file.filename, name: originalName, mimeType, size: req.file.size });
  },

  /** Streams an attachment with Range support so videos and voice notes can seek. Auth via header or `?token=`. */
  media: async (req: Request, res: Response) => {
    const stored = path.basename(req.params.name);
    const upload = await chatService.mediaFor(currentUserId(req), stored);
    const filePath = path.join(CHAT_UPLOAD_DIR, stored);
    if (!fs.existsSync(filePath)) throw BadRequest('File no longer exists');
    const mimeType = upload.mimeType || 'application/octet-stream';
    const inline = INLINE_TYPES.test(mimeType);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.setHeader('Content-Type', inline ? mimeType : 'application/octet-stream');
    const encoded = encodeURIComponent(upload.originalName);
    const disposition = inline && req.query.download !== '1' ? 'inline' : 'attachment';
    res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encoded}`);
    res.sendFile(filePath, { headers: {} });
  },
};
