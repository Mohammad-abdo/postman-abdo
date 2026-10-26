import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { requestService } from './request.service';

const ok = (res: Response) => res.json({ ok: true });

export const requestController = {
  create: async (req: Request, res: Response) => res.json(await requestService.create(currentUserId(req), req.body)),
  get: async (req: Request, res: Response) => res.json(await requestService.get(currentUserId(req), req.params.id)),
  update: async (req: Request, res: Response) => res.json(await requestService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await requestService.remove(currentUserId(req), req.params.id);
    ok(res);
  },
  duplicate: async (req: Request, res: Response) => res.json(await requestService.duplicate(currentUserId(req), req.params.id)),
  move: async (req: Request, res: Response) => {
    await requestService.move(currentUserId(req), req.params.id, req.body);
    ok(res);
  },
};
