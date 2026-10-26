import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { safeFileName } from '../../core/utils/object';
import { collectionService } from './collection.service';

const ok = (res: Response) => res.json({ ok: true });

export const collectionController = {
  create: async (req: Request, res: Response) => res.json(await collectionService.create(currentUserId(req), req.body)),
  get: async (req: Request, res: Response) => res.json(await collectionService.get(currentUserId(req), req.params.id)),
  update: async (req: Request, res: Response) => res.json(await collectionService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await collectionService.moveToTrash(currentUserId(req), req.params.id);
    ok(res);
  },
  trash: async (req: Request, res: Response) => res.json(await collectionService.trash(currentUserId(req), req.params.workspaceId)),
  restore: async (req: Request, res: Response) => res.json(await collectionService.restore(currentUserId(req), req.params.id)),
  destroy: async (req: Request, res: Response) => {
    await collectionService.destroy(currentUserId(req), req.params.id);
    ok(res);
  },
  setPosition: async (req: Request, res: Response) => {
    await collectionService.setPosition(currentUserId(req), req.params.id, req.body.index);
    ok(res);
  },
  duplicate: async (req: Request, res: Response) => res.json(await collectionService.duplicate(currentUserId(req), req.params.id)),
  export: async (req: Request, res: Response) => {
    const { name, json } = await collectionService.export(currentUserId(req), req.params.id);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(name)}.postman_collection.json"`);
    res.json(json);
  },
};
