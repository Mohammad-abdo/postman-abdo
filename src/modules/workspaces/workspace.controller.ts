import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { withNotification } from '../notifications/workspace-event.notifier';
import { workspaceService } from './workspace.service';

export const workspaceController = {
  list: async (req: Request, res: Response) => res.json(await workspaceService.list(currentUserId(req))),
  create: async (req: Request, res: Response) => res.json(await workspaceService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await workspaceService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await workspaceService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
  // Member mutations return `{ result, event }`; the event becomes notifications for everyone affected.
  addMember: async (req: Request, res: Response) => {
    const result = withNotification(await workspaceService.addMember(currentUserId(req), req.params.id, req.body));
    res.json({ ok: true, ...result });
  },
  removeMember: async (req: Request, res: Response) => {
    res.json(withNotification(await workspaceService.removeMember(currentUserId(req), req.params.id, req.params.userId)));
  },
  updateMember: async (req: Request, res: Response) => {
    res.json(withNotification(await workspaceService.updateMember(currentUserId(req), req.params.id, req.params.userId, req.body)));
  },
  overview: async (req: Request, res: Response) => res.json(await workspaceService.overview(currentUserId(req), req.params.id)),
  tree: async (req: Request, res: Response) => res.json(await workspaceService.tree(currentUserId(req), req.params.id)),
  search: async (req: Request, res: Response) =>
    res.json(await workspaceService.search(currentUserId(req), req.params.id, String(req.query.q || ''))),
};
