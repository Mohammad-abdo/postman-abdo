import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { exampleService } from './example.service';

export const exampleController = {
  create: async (req: Request, res: Response) => res.json(await exampleService.create(currentUserId(req), req.body)),
  get: async (req: Request, res: Response) => res.json(await exampleService.get(currentUserId(req), req.params.id)),
  update: async (req: Request, res: Response) => res.json(await exampleService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await exampleService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
  duplicate: async (req: Request, res: Response) => res.json(await exampleService.duplicate(currentUserId(req), req.params.id)),
};
