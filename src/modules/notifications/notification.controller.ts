import { Request, Response } from 'express';
import fs from 'fs';
import { audit } from '../../core/audit/audit.service';
import { BadRequest } from '../../core/errors/http-error';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { notificationService } from './notification.service';
import { soundService } from './sound.service';

export const notificationController = {
  list: async (req: Request, res: Response) =>
    res.json(await notificationService.list(currentUserId(req), { cursor: req.query.cursor as string | undefined, unreadOnly: req.query.unread === 'true' })),
  unreadCount: async (req: Request, res: Response) => res.json({ unread: await notificationService.unreadCount(currentUserId(req)) }),
  markRead: async (req: Request, res: Response) => res.json(await notificationService.markRead(currentUserId(req), req.body.ids)),
  remove: async (req: Request, res: Response) => res.json(await notificationService.remove(currentUserId(req), req.params.id)),
  clear: async (req: Request, res: Response) => res.json(await notificationService.clear(currentUserId(req))),
  sounds: async (_req: Request, res: Response) => res.json({ sounds: await soundService.list(), categories: soundService.categories() }),
};

const parseEvents = (raw: unknown) => {
  if (Array.isArray(raw)) return raw as string[];
  if (typeof raw === 'string' && raw) return raw.split(',').map((s) => s.trim());
  return undefined;
};

/** Admin dashboard: manage notification tones. */
export const soundAdminController = {
  list: notificationController.sounds,

  upload: async (req: Request, res: Response) => {
    const file = req.file;
    if (!file) throw BadRequest('Choose an audio file');
    if (!/^audio\//.test(file.mimetype)) {
      fs.rm(file.path, () => undefined);
      throw BadRequest('Only audio files (mp3, wav, ogg, m4a) can be used as notification sounds');
    }
    const sound = await soundService.create(file, {
      name: req.body.name,
      events: parseEvents(req.body.events) as never,
      isDefault: req.body.isDefault === 'true',
      volume: req.body.volume ? Number(req.body.volume) : undefined,
    });
    audit(req, { action: 'sound.upload', targetType: 'sound', targetId: sound.id, details: { name: sound.name } });
    res.json(sound);
  },

  update: async (req: Request, res: Response) => {
    const sound = await soundService.update(req.params.id, req.body);
    audit(req, { action: 'sound.update', targetType: 'sound', targetId: sound.id, details: req.body });
    res.json(sound);
  },

  remove: async (req: Request, res: Response) => {
    await soundService.remove(req.params.id);
    audit(req, { action: 'sound.delete', targetType: 'sound', targetId: req.params.id });
    res.json({ ok: true });
  },
};
