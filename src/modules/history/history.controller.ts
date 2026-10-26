import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { historyService } from './history.service';

export const historyController = {
  list: async (req: Request, res: Response) =>
    res.json(await historyService.list(currentUserId(req), String(req.query.workspaceId || ''), Number(req.query.limit) || undefined)),
  clear: async (req: Request, res: Response) => {
    await historyService.clear(currentUserId(req), String(req.query.workspaceId || ''));
    res.json({ ok: true });
  },
  removeMany: async (req: Request, res: Response) => {
    await historyService.removeMany(currentUserId(req), req.body.ids);
    res.json({ ok: true });
  },
};
