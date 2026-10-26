import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { withNotification } from '../notifications/workspace-event.notifier';
import { projectService } from './project.service';

/**
 * Mutations that change who is in a project return `{ result, event }` from the service;
 * `withNotification` turns the event into notifications for everyone affected.
 */
export const projectController = {
  list: async (req: Request, res: Response) => res.json(await projectService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  get: async (req: Request, res: Response) => res.json(await projectService.get(currentUserId(req), req.params.id)),
  create: async (req: Request, res: Response) => res.json(withNotification(await projectService.create(currentUserId(req), req.body))),
  update: async (req: Request, res: Response) => res.json(await projectService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => res.json(withNotification(await projectService.remove(currentUserId(req), req.params.id))),
  members: async (req: Request, res: Response) => res.json(await projectService.members(currentUserId(req), req.params.id)),
  addMembers: async (req: Request, res: Response) => res.json(withNotification(await projectService.addMembers(currentUserId(req), req.params.id, req.body))),
  updateMember: async (req: Request, res: Response) =>
    res.json(withNotification(await projectService.updateMember(currentUserId(req), req.params.id, req.params.userId, req.body.role))),
  removeMember: async (req: Request, res: Response) =>
    res.json(withNotification(await projectService.removeMember(currentUserId(req), req.params.id, req.params.userId))),
  attachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, true)),
  detachCollection: async (req: Request, res: Response) =>
    res.json(await projectService.setCollection(currentUserId(req), req.params.id, req.params.collectionId, false)),
};
