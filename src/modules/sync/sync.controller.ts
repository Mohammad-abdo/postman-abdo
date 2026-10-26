import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { syncService } from './sync.service';

export const syncController = {
  heartbeat: async (req: Request, res: Response) => res.json(await syncService.heartbeat(currentUserId(req), req.body)),
  devices: async (req: Request, res: Response) => res.json(await syncService.devices(currentUserId(req))),
  recordHistory: async (req: Request, res: Response) => res.json(await syncService.recordHistory(currentUserId(req), req.body)),
};
