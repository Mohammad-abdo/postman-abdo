import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { authService } from './auth.service';

export const authController = {
  register: async (req: Request, res: Response) => res.json(await authService.register(req.body)),
  login: async (req: Request, res: Response) => res.json(await authService.login(req.body)),
  me: async (req: Request, res: Response) => res.json(await authService.me(currentUserId(req))),
  updateProfile: async (req: Request, res: Response) => res.json(await authService.updateProfile(currentUserId(req), req.body)),
};
