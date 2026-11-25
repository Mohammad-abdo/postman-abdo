import { NextFunction, Request, Response, Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { publishRemixSchema } from '../../shared/testapp/design/customize';
import { abEventsSchema, abService } from './ab.service';
import { publicInvokeSchema, publicSessionSchema, shareService, unlockSchema } from './share.service';

/** Unauthenticated, mock-only surface for shared test apps. Mounted at /public/testapp. */
export const publicTestAppRoutes = Router();

publicTestAppRoutes.use((_req: Request, res: Response, next: NextFunction) => {
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  next();
});

const unlock = (req: Request) => req.header('x-share-unlock') || undefined;
const t = (req: Request) => String(req.params.token);

publicTestAppRoutes.get('/:token', async (req, res) => res.json(await shareService.meta(t(req))));
publicTestAppRoutes.post('/:token/unlock', validateBody(unlockSchema), async (req, res) => res.json(await shareService.unlock(t(req), req.body.password)));
publicTestAppRoutes.get('/:token/schema', async (req, res) => res.json(await shareService.schema(t(req), unlock(req), typeof req.query.v === 'string' ? req.query.v.slice(0, 64) : undefined)));
publicTestAppRoutes.post('/:token/ab', validateBody(abEventsSchema), async (req, res) => {
  const share = await shareService.resolve(t(req));
  shareService.assertUnlocked(share, unlock(req));
  res.json(await abService.record(share.testAppId, req.body));
});
publicTestAppRoutes.post('/:token/remixes', validateBody(publishRemixSchema), async (req, res) => res.status(201).json(await shareService.publishRemix(t(req), unlock(req), req.body)));
publicTestAppRoutes.post('/:token/sessions', validateBody(publicSessionSchema), async (req, res) => res.json(await shareService.openSession(t(req), unlock(req), req.body.seed)));
publicTestAppRoutes.post('/:token/sessions/:sid/invoke', validateBody(publicInvokeSchema), async (req, res) => res.json(await shareService.invoke(t(req), unlock(req), String(req.params.sid), req.body)));
publicTestAppRoutes.post('/:token/sessions/:sid/reset', async (req, res) => res.json(await shareService.reset(t(req), unlock(req), String(req.params.sid))));
