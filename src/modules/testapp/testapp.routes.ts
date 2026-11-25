import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { testAppController as c } from './testapp.controller';
import { createShareSchema, shareService } from './share.service';
import { aiService } from './ai.service';
import { abService } from './ab.service';
import { z } from 'zod';
import { audit } from '../../core/audit/audit.service';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { realInvokeSchema, rulesSchema, runSchema, analyzeSchema, createSessionSchema, createTestAppSchema, invokeSchema, overrideSchema, regenerateSchema, resetSchema, updateTestAppSchema } from './testapp.schema';
import { testAppService } from './testapp.service';
import { saveDesignSchema } from '../../shared/testapp/design/customize';

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

testAppRoutes.post('/:id/runs', validateBody(runSchema), c.run);
testAppRoutes.post('/:id/real/invoke', validateBody(realInvokeSchema), c.realInvoke);
testAppRoutes.get('/:id/rules', c.rules);
testAppRoutes.put('/:id/rules', validateBody(rulesSchema), c.saveRules);
testAppRoutes.post('/:id/rules/preview', validateBody(rulesSchema), c.previewRules);
testAppRoutes.get('/:id/runs', c.runs);
testAppRoutes.get('/:id/runs/:rid', c.getRun);
testAppRoutes.get('/:id/runs/:rid/export', c.exportRun);
testAppRoutes.get('/:id/coverage', c.coverage);

testAppRoutes.put('/:id/design', validateBody(saveDesignSchema), async (req, res) => res.json(await testAppService.saveDesign(currentUserId(req), String(req.params.id), req.body.customization)));
testAppRoutes.get('/:id/remixes', async (req, res) => res.json(await testAppService.remixes(currentUserId(req), String(req.params.id))));
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

testAppRoutes.get('/:id/ai/status', async (req, res) => res.json(await aiService.status(currentUserId(req), String(req.params.id))));
testAppRoutes.post('/:id/ai/suggest', async (req, res) => {
  const out = await aiService.suggestTests(currentUserId(req), String(req.params.id));
  audit(req, { action: 'testapp.ai.suggest', targetType: 'testapp', targetId: String(req.params.id), details: { tokens: out.tokens, accepted: out.accepted.length, rejected: out.rejected.length } });
  res.json(out);
});
testAppRoutes.get('/:id/ab', async (req, res) => res.json(await abService.results(currentUserId(req), String(req.params.id), typeof req.query.experiment === 'string' ? req.query.experiment.slice(0, 60) : undefined)));
testAppRoutes.delete('/:id/ab', async (req, res) => res.json(await abService.reset(currentUserId(req), String(req.params.id), typeof req.query.experiment === 'string' ? req.query.experiment.slice(0, 60) : undefined)));
const aiDesignSchema = z.object({ mode: z.enum(['design', 'edit', 'redesign']), prompt: z.string().trim().max(1000).default(''), current: z.any().optional(), focus: z.string().max(200).optional() });
testAppRoutes.post('/:id/ai/design', validateBody(aiDesignSchema), async (req, res) => {
  const out = await aiService.design(currentUserId(req), String(req.params.id), req.body);
  audit(req, { action: 'testapp.ai.design', targetType: 'testapp', targetId: String(req.params.id), details: { mode: req.body.mode, tokens: out.tokens, options: out.proposals.length } });
  res.json(out);
});
testAppRoutes.post('/:id/ai/review', validateBody(z.object({ current: z.any().optional() })), async (req, res) => {
  const out = await aiService.review(currentUserId(req), String(req.params.id), req.body.current);
  audit(req, { action: 'testapp.ai.review', targetType: 'testapp', targetId: String(req.params.id), details: { tokens: out.tokens, findings: out.findings.length } });
  res.json(out);
});
testAppRoutes.post('/:id/ai/explain', validateBody(z.object({ runId: z.string().min(1).max(64), testId: z.string().min(1).max(20) })), async (req, res) => {
  const out = await aiService.explain(currentUserId(req), String(req.params.id), req.body.runId, req.body.testId);
  audit(req, { action: 'testapp.ai.explain', targetType: 'testapp', targetId: String(req.params.id), details: { tokens: out.tokens } });
  res.json(out);
});
