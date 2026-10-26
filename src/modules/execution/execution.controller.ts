import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { executionService } from './execution.service';
import { runService } from './run.service';

/** Opens a Server-Sent Events stream and returns a writer for it. */
function openEventStream(res: Response) {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();
  return (event: string, data: unknown) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export const executionController = {
  send: async (req: Request, res: Response) => res.json(await executionService.send(currentUserId(req), req.body)),

  run: async (req: Request, res: Response) => {
    const write = openEventStream(res);
    let abort: (() => void) | null = null;
    res.on('close', () => !res.writableEnded && abort?.());
    try {
      const summary = await executionService.run(currentUserId(req), req.body, {
        onEvent: (event, payload) => write(event, payload),
        registerAbort: (fn) => (abort = fn),
      });
      write('done', summary);
    } catch (e) {
      write('error', { message: (e as Error).message });
    }
    res.end();
  },

  listRuns: async (req: Request, res: Response) =>
    res.json(
      await runService.list(
        currentUserId(req),
        String(req.query.workspaceId || ''),
        req.query.collectionId ? String(req.query.collectionId) : undefined,
      ),
    ),
  getRun: async (req: Request, res: Response) => res.json(await runService.get(currentUserId(req), req.params.id)),
  removeRun: async (req: Request, res: Response) => {
    await runService.remove(currentUserId(req), req.params.id);
    res.json({ ok: true });
  },
};
