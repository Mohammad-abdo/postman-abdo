"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publicTestAppRoutes = void 0;
const express_1 = require("express");
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const share_service_1 = require("./share.service");
/** Unauthenticated, mock-only surface for shared test apps. Mounted at /public/testapp. */
exports.publicTestAppRoutes = (0, express_1.Router)();
exports.publicTestAppRoutes.use((_req, res, next) => {
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Cache-Control', 'no-store');
    next();
});
const unlock = (req) => req.header('x-share-unlock') || undefined;
const t = (req) => String(req.params.token);
exports.publicTestAppRoutes.get('/:token', async (req, res) => res.json(await share_service_1.shareService.meta(t(req))));
exports.publicTestAppRoutes.post('/:token/unlock', (0, validate_middleware_1.validateBody)(share_service_1.unlockSchema), async (req, res) => res.json(await share_service_1.shareService.unlock(t(req), req.body.password)));
exports.publicTestAppRoutes.get('/:token/schema', async (req, res) => res.json(await share_service_1.shareService.schema(t(req), unlock(req))));
exports.publicTestAppRoutes.post('/:token/sessions', (0, validate_middleware_1.validateBody)(share_service_1.publicSessionSchema), async (req, res) => res.json(await share_service_1.shareService.openSession(t(req), unlock(req), req.body.seed)));
exports.publicTestAppRoutes.post('/:token/sessions/:sid/invoke', (0, validate_middleware_1.validateBody)(share_service_1.publicInvokeSchema), async (req, res) => res.json(await share_service_1.shareService.invoke(t(req), unlock(req), String(req.params.sid), req.body)));
exports.publicTestAppRoutes.post('/:token/sessions/:sid/reset', async (req, res) => res.json(await share_service_1.shareService.reset(t(req), unlock(req), String(req.params.sid))));
