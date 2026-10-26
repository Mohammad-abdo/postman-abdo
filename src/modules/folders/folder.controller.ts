import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { folderService } from './folder.service';

const ok = (res: Response) => res.json({ ok: true });

export const folderController = {
  create: async (req: Request, res: Response) => res.json(await folderService.create(currentUserId(req), req.body)),
  get: async (req: Request, res: Response) => res.json(await folderService.get(currentUserId(req), req.params.id)),
  update: async (req: Request, res: Response) => res.json(await folderService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await folderService.remove(currentUserId(req), req.params.id);
    ok(res);
  },
  duplicate: async (req: Request, res: Response) => {
    await folderService.duplicate(currentUserId(req), req.params.id);
    ok(res);
  },
  move: async (req: Request, res: Response) => {
    await folderService.move(currentUserId(req), req.params.id, req.body);
    ok(res);
  },
};
