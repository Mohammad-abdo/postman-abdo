import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { accountService } from './account.service';

export const accountController = {
  overview: async (req: Request, res: Response) => res.json(await accountService.overview(currentUserId(req))),
  updateProfile: async (req: Request, res: Response) => res.json(await accountService.updateProfile(currentUserId(req), req.body)),
  setAvatar: async (req: Request, res: Response) => res.json(await accountService.setAvatar(currentUserId(req), req.body.dataUrl)),
  changePassword: async (req: Request, res: Response) => res.json(await accountService.changePassword(req, currentUserId(req), req.body)),
  logoutEverywhere: async (req: Request, res: Response) => res.json(await accountService.logoutEverywhere(req, currentUserId(req))),
  activity: async (req: Request, res: Response) => res.json(await accountService.activity(currentUserId(req), Math.min(Number(req.query.days) || 30, 90))),
  updatePreferences: async (req: Request, res: Response) => res.json(await accountService.updatePreferences(currentUserId(req), req.body.settings)),
};
