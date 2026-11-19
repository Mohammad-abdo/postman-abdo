import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { testAppController as c } from './testapp.controller';
import { createShareSchema, shareService } from './share.service';
import { audit } from '../../core/audit/audit.service';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { analyzeSchema, createSessionSchema, createTestAppSchema, invokeSchema, overrideSchema, regenerateSchema, resetSchema, updateTestAppSchema } from './testapp.schema';

/** Collection-to-Test-App generator (authenticated). Mounted at /api/testapps. */
export const testAppRoutes = Router();

testAppRoutes.post('/analyze', validateBody(analyzeSchema), c.analyze);
testAppRoutes.get('/', c.list);
testAppRoutes.post('/', validateBody(createTestAppSchema), c.create);
testAppRoutes.get('/:id', c.get);
testAppRoutes.patch('/:id', validateBody(updateTestAppSchema), c.update);
testAppRoutes.delete('/:id', c.remove);

testAppRoutes.get('/:id/versions', c.versions);
testAppRoutes.get('/:id/versions/:v', c.versionPart);
testAppRoutes.post('/:id/regenerate', validateBody(regenerateSchema), c.regenerate);

testAppRoutes.put('/:id/overrides/:target', validateBody(overrideSchema), c.setOverride);
testAppRoutes.delete('/:id/overrides/:target', c.removeOverride);

testAppRoutes.post('/:id/sessions', validateBody(createSessionSchema), c.createSession);
testAppRoutes.post('/:id/sessions/:sid/invoke', validateBody(invokeSchema), c.invoke);
testAppRoutes.post('/:id/sessions/:sid/reset', validateBody(resetSchema), c.reset);
testAppRoutes.get('/:id/sessions/:sid/logs', c.logs);
testAppRoutes.get('/:id/sessions/:sid/state', c.state);

testAppRoutes.post('/:id/runs', c.run);
testAppRoutes.get('/:id/runs', c.runs);
testAppRoutes.get('/:id/runs/:rid', c.getRun);
testAppRoutes.get('/:id/runs/:rid/export', c.exportRun);
testAppRoutes.get('/:id/coverage', c.coverage);

testAppRoutes.get('/:id/shares', async (req, res) => res.json(await shareService.list(currentUserId(req), String(req.params.id))));
testAppRoutes.post('/:id/shares', validateBody(createShareSchema), async (req, res) => {
  const out = await shareService.create(currentUserId(req), String(req.params.id), req.body);
  audit(req, { action: 'testapp.share.create', targetType: 'testapp', targetId: String(req.params.id), details: { shareId: out.share.id, password: out.share.hasPassword, expiresAt: out.share.expiresAt } });
  res.json(out);
});
testAppRoutes.delete('/:id/shares/:shareId', async (req, res) => {
  await shareService.revoke(currentUserId(req), String(req.params.id), String(req.params.shareId));
  audit(req, { action: 'testapp.share.revoke', targetType: 'testapp', targetId: String(req.params.id), details: { shareId: String(req.params.shareId) } });
  res.json({ ok: true });
});
