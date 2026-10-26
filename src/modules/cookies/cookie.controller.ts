import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { cookieService } from './cookie.service';

export const cookieController = {
  list: async (req: Request, res: Response) => res.json(await cookieService.getAll(currentUserId(req))),
  upsert: async (req: Request, res: Response) => res.json(await cookieService.upsertRaw(currentUserId(req), req.body.domain, req.body.raw)),
  remove: async (req: Request, res: Response) =>
    res.json(await cookieService.remove(currentUserId(req), req.body.domain, req.body.name, req.body.path)),
  clear: async (req: Request, res: Response) => {
    await cookieService.clear(currentUserId(req));
    res.json([]);
  },
};
