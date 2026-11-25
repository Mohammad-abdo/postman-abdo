import { Request, Response } from 'express';
import { audit } from '../../core/audit/audit.service';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { withNotification } from '../notifications/workspace-event.notifier';
import { workspaceService } from './workspace.service';

export const workspaceController = {
  list: async (req: Request, res: Response) => res.json(await workspaceService.list(currentUserId(req))),
  create: async (req: Request, res: Response) => res.json(await workspaceService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => {
    const out = await workspaceService.update(currentUserId(req), req.params.id, req.body);
    audit(req, { action: 'workspace.updated', targetType: 'workspace', targetId: req.params.id, details: { fields: Object.keys(req.body) } });
    res.json(out);
  },
  remove: async (req: Request, res: Response) => {
    await workspaceService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
  // Member mutations return `{ result, event }`; the event becomes notifications for everyone affected.
  addMember: async (req: Request, res: Response) => {
    const result = withNotification(await workspaceService.addMember(currentUserId(req), req.params.id, req.body));
    audit(req, { action: 'workspace.member_added', targetType: 'workspace', targetId: req.params.id, details: { email: req.body.email, role: req.body.role } });
    res.json({ ok: true, ...result });
  },
  removeMember: async (req: Request, res: Response) => {
    const out = withNotification(await workspaceService.removeMember(currentUserId(req), req.params.id, req.params.userId));
    audit(req, { action: 'workspace.member_removed', targetType: 'workspace', targetId: req.params.id, details: { userId: req.params.userId } });
    res.json(out);
  },
  updateMember: async (req: Request, res: Response) => {
    const out = withNotification(await workspaceService.updateMember(currentUserId(req), req.params.id, req.params.userId, req.body));
    audit(req, { action: 'workspace.member_role', targetType: 'workspace', targetId: req.params.id, details: { userId: req.params.userId, role: req.body.role } });
    res.json(out);
  },
  overview: async (req: Request, res: Response) => res.json(await workspaceService.overview(currentUserId(req), req.params.id)),
  insights: async (req: Request, res: Response) => res.json(await workspaceService.insights(currentUserId(req), req.params.id, Math.min(Math.max(Number(req.query.days) || 14, 7), 60))),
  tree: async (req: Request, res: Response) => res.json(await workspaceService.tree(currentUserId(req), req.params.id)),
  search: async (req: Request, res: Response) =>
    res.json(await workspaceService.search(currentUserId(req), req.params.id, String(req.query.q || ''))),
};
