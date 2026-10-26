import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { monitorService } from './monitor.service';

export const monitorController = {
  list: async (req: Request, res: Response) => res.json(await monitorService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  create: async (req: Request, res: Response) => res.json(await monitorService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await monitorService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await monitorService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
  runNow: async (req: Request, res: Response) => res.json(await monitorService.runNow(currentUserId(req), req.params.id)),
  runs: async (req: Request, res: Response) => res.json(await monitorService.runs(currentUserId(req), req.params.id)),
};
