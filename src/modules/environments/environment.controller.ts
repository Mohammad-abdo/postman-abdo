import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { safeFileName } from '../../core/utils/object';
import { environmentService } from './environment.service';

export const environmentController = {
  list: async (req: Request, res: Response) => res.json(await environmentService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  create: async (req: Request, res: Response) => res.json(await environmentService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await environmentService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await environmentService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
  duplicate: async (req: Request, res: Response) => res.json(await environmentService.duplicate(currentUserId(req), req.params.id)),
  export: async (req: Request, res: Response) => {
    const json = await environmentService.export(currentUserId(req), req.params.id);
    const suffix = json._postman_variable_scope === 'globals' ? 'postman_globals' : 'postman_environment';
    res.setHeader('Content-Disposition', `attachment; filename="${safeFileName(json.name)}.${suffix}.json"`);
    res.json(json);
  },
};
