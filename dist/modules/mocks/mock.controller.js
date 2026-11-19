"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const http_error_1 = require("../../core/errors/http-error");
const mock_service_1 = require("./mock.service");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
exports.mockController = {
    list: async (req, res) => res.json(await mock_service_1.mockService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    create: async (req, res) => res.json(await mock_service_1.mockService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    update: async (req, res) => res.json(await mock_service_1.mockService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await mock_service_1.mockService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
    /** Public endpoint: `/mock/:mockId/<path>` answers with a saved example. */
    serve: async (req, res) => {
        try {
            const response = await mock_service_1.mockService.respond(req.params.mockId, req.header('x-api-key'), {
                method: req.method,
                path: req.params[0] || '',
                query: new URLSearchParams(req.originalUrl.split('?')[1] || ''),
                responseName: req.header('x-mock-response-name'),
                responseId: req.header('x-mock-response-id'),
                responseCode: req.header('x-mock-response-code'),
            });
            if (response.delay)
                await sleep(response.delay);
            res.status(response.status).set(response.headers).send(response.body);
        }
        catch (e) {
            const status = e instanceof http_error_1.HttpError ? e.status : 500;
            res.status(status).json({ error: { name: status === 404 ? 'mockRequestNotFoundError' : 'mockError', message: e.message } });
        }
    },
};
