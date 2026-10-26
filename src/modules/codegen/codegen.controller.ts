import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { codegenService } from './codegen.service';

export const codegenController = {
  languages: (_req: Request, res: Response) => res.json(codegenService.languages()),
  generate: async (req: Request, res: Response) => res.json({ snippet: await codegenService.generate(currentUserId(req), req.body) }),
};
