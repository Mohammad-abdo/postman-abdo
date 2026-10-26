import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { HttpError } from '../../core/errors/http-error';
import { mockService } from './mock.service';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export const mockController = {
  list: async (req: Request, res: Response) => res.json(await mockService.list(currentUserId(req), String(req.query.workspaceId || ''))),
  create: async (req: Request, res: Response) => res.json(await mockService.create(currentUserId(req), req.body)),
  update: async (req: Request, res: Response) => res.json(await mockService.update(currentUserId(req), req.params.id, req.body)),
  remove: async (req: Request, res: Response) => {
    await mockService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },

  /** Public endpoint: `/mock/:mockId/<path>` answers with a saved example. */
  serve: async (req: Request, res: Response) => {
    try {
      const response = await mockService.respond(req.params.mockId, req.header('x-api-key'), {
        method: req.method,
        path: (req.params as Record<string, string>)[0] || '',
        query: new URLSearchParams(req.originalUrl.split('?')[1] || ''),
        responseName: req.header('x-mock-response-name'),
        responseId: req.header('x-mock-response-id'),
        responseCode: req.header('x-mock-response-code'),
      });
      if (response.delay) await sleep(response.delay);
      res.status(response.status).set(response.headers).send(response.body);
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      res.status(status).json({ error: { name: status === 404 ? 'mockRequestNotFoundError' : 'mockError', message: (e as Error).message } });
    }
  },
};
