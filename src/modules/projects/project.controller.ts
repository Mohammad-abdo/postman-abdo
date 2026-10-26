import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { projectService } from './project.service';

/**
 * Mutations that change who is in a project return `{ result, event }` from the service;
 * `event` (actor, workspace, project, target users) is the hook point for notifications.
 */
export const projectController = {
  list: async (req: Request, res: Response) => res.json(await projectService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  get: async (req: Request, res: Response) => res.json(await projectService.get(currentUserId(req), req.params.id)),
  create: async (req: Request, res: Response) => res.json((await projectService.create(currentUserId(req), req.body)).result),
  update: async (req: Request, res: Response) => res.json(await projectService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => res.json((await projectService.remove(currentUserId(req), req.params.id)).result),
  members: async (req: Request, res: Response) => res.json(await projectService.members(currentUserId(req), req.params.id)),
  addMembers: async (req: Request, res: Response) => res.json((await projectService.addMembers(currentUserId(req), req.params.id, req.body)).result),
  updateMember: async (req: Request, res: Response) =>
    res.json((await projectService.updateMember(currentUserId(req), req.params.id, req.params.userId, req.body.role)).result),
  removeMember: async (req: Request, res: Response) =>
    res.json((await projectService.removeMember(currentUserId(req), req.params.id, req.params.userId)).result),
  attachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, true)),
  detachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, false)),
};
