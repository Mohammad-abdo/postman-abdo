import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { chatService } from './chat.service';

export const chatController = {
  list: async (req: Request, res: Response) => res.json(await chatService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  open: async (req: Request, res: Response) => res.json(await chatService.open(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await chatService.update(currentUserId(req), req.params.id, req.body)),
  addMembers: async (req: Request, res: Response) => res.json(await chatService.addMembers(currentUserId(req), req.params.id, req.body.userIds)),
  leave: async (req: Request, res: Response) => res.json(await chatService.leave(currentUserId(req), req.params.id)),
  messages: async (req: Request, res: Response) =>
    res.json(await chatService.messages(currentUserId(req), req.params.id, req.query.before ? String(req.query.before) : undefined)),
  send: async (req: Request, res: Response) => res.json(await chatService.send(currentUserId(req), req.params.id, req.body)),
  markRead: async (req: Request, res: Response) => res.json(await chatService.markRead(currentUserId(req), req.params.id)),
  edit: async (req: Request, res: Response) => res.json(await chatService.edit(currentUserId(req), req.params.id, req.body.body)),
  remove: async (req: Request, res: Response) => res.json(await chatService.remove(currentUserId(req), req.params.id)),
  presence: async (req: Request, res: Response) => res.json(await chatService.presence(currentUserId(req), String(req.query.workspaceId || ''))),
};
