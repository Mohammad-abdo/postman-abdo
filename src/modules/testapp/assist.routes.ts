import { Router } from 'express';
import { audit } from '../../core/audit/audit.service';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { aiService, explainResponseSchema, scriptInputSchema } from './ai.service';

/** AI helpers for the request editor (not tied to a Test App). Mounted at /api/ai. */
export const assistRoutes = Router();

assistRoutes.post('/script', validateBody(scriptInputSchema), async (req, res) => {
  const out = await aiService.script(currentUserId(req), req.body);
  audit(req, { action: 'ai.script', details: { phase: req.body.phase, tokens: out.tokens } });
  res.json(out);
});

assistRoutes.post('/explain-response', validateBody(explainResponseSchema), async (req, res) => {
  const out = await aiService.explainResponse(currentUserId(req), req.body);
  audit(req, { action: 'ai.explain-response', details: { status: req.body.status, tokens: out.tokens } });
  res.json(out);
});
