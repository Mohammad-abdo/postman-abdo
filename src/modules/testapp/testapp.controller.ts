import { Request, Response } from 'express';
import { audit } from '../../core/audit/audit.service';
import { BadRequest } from '../../core/errors/http-error';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { testAppService } from './testapp.service';

const u = currentUserId;
const p = (req: Request, k: string) => String(req.params[k]);

export const testAppController = {
  analyze: async (req: Request, res: Response) => res.json(await testAppService.analyze(u(req), req.body.collectionId)),
  list: async (req: Request, res: Response) => res.json(await testAppService.list(u(req), String(req.query.workspaceId || ''))),
  create: async (req: Request, res: Response) => {
    const out = await testAppService.create(u(req), req.body);
    audit(req, { action: 'testapp.generate', targetType: 'testapp', targetId: out.app.id, details: { collectionId: req.body.collectionId } });
    res.json(out);
  },
  get: async (req: Request, res: Response) => res.json(await testAppService.get(u(req), p(req, 'id'))),
  update: async (req: Request, res: Response) => res.json(await testAppService.update(u(req), p(req, 'id'), req.body)),
  remove: async (req: Request, res: Response) => {
    await testAppService.remove(u(req), p(req, 'id'));
    audit(req, { action: 'testapp.delete', targetType: 'testapp', targetId: p(req, 'id') });
    res.json({ ok: true });
  },
  versions: async (req: Request, res: Response) => res.json(await testAppService.versions(u(req), p(req, 'id'))),
  versionPart: async (req: Request, res: Response) => {
    const n = Number(req.params.v);
    if (!Number.isInteger(n)) throw BadRequest('Invalid version');
    res.json(await testAppService.versionPart(u(req), p(req, 'id'), n, String(req.query.part || 'schema')));
  },
  setOverride: async (req: Request, res: Response) => res.json(await testAppService.setOverride(u(req), p(req, 'id'), decodeURIComponent(p(req, 'target')), req.body.decision)),
  removeOverride: async (req: Request, res: Response) => {
    await testAppService.removeOverride(u(req), p(req, 'id'), decodeURIComponent(p(req, 'target')));
    res.json({ ok: true });
  },
  regenerate: async (req: Request, res: Response) => {
    const out = await testAppService.regenerate(u(req), p(req, 'id'), req.body);
    if (!req.body.preview) audit(req, { action: 'testapp.regenerate', targetType: 'testapp', targetId: p(req, 'id') });
    res.json(out);
  },
  createSession: async (req: Request, res: Response) => res.json(await testAppService.createSession(u(req), p(req, 'id'), req.body)),
  invoke: async (req: Request, res: Response) => res.json(await testAppService.invoke(u(req), p(req, 'id'), p(req, 'sid'), req.body)),
  reset: async (req: Request, res: Response) => res.json(await testAppService.reset(u(req), p(req, 'id'), p(req, 'sid'), req.body.seed)),
  logs: async (req: Request, res: Response) => res.json(await testAppService.logs(u(req), p(req, 'id'), p(req, 'sid'))),
  state: async (req: Request, res: Response) => res.json(await testAppService.stateSummary(u(req), p(req, 'id'), p(req, 'sid'))),
  run: async (req: Request, res: Response) => res.json(await testAppService.run(u(req), p(req, 'id'))),
  runs: async (req: Request, res: Response) => res.json(await testAppService.runs(u(req), p(req, 'id'))),
  getRun: async (req: Request, res: Response) => res.json(await testAppService.getRun(u(req), p(req, 'id'), p(req, 'rid'))),
  exportRun: async (req: Request, res: Response) => {
    if (req.query.format === 'md') {
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="test-report-${p(req, 'rid').slice(0, 8)}.md"`);
      return res.send(await testAppService.reportMarkdown(u(req), p(req, 'id'), p(req, 'rid')));
    }
    res.json(await testAppService.getRun(u(req), p(req, 'id'), p(req, 'rid')));
  },
  coverage: async (req: Request, res: Response) => res.json(await testAppService.coverage(u(req), p(req, 'id'))),
};
