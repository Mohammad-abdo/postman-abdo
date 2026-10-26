import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { projectService } from './project.service';

const ok = (res: Response) => res.json({ ok: true });

export const projectController = {
  list: async (req: Request, res: Response) => res.json(await projectService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  get: async (req: Request, res: Response) => res.json(await projectService.get(currentUserId(req), req.params.id)),
  create: async (req: Request, res: Response) => res.json(await projectService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await projectService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await projectService.remove(currentUserId(req), req.params.id);
    ok(res);
  },
  members: async (req: Request, res: Response) => res.json(await projectService.members(currentUserId(req), req.params.id)),
  addMember: async (req: Request, res: Response) => res.json(await projectService.addMember(currentUserId(req), req.params.id, req.body)),
  updateMember: async (req: Request, res: Response) =>
    res.json(await projectService.updateMember(currentUserId(req), req.params.id, req.params.userId, req.body.role)),
  removeMember: async (req: Request, res: Response) => {
    await projectService.removeMember(currentUserId(req), req.params.id, req.params.userId);
    ok(res);
  },
  attachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, true)),
  detachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, false)),
};
