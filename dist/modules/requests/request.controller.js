"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const request_service_1 = require("./request.service");
const ok = (res) => res.json({ ok: true });
exports.requestController = {
    create: async (req, res) => res.json(await request_service_1.requestService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    get: async (req, res) => res.json(await request_service_1.requestService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    update: async (req, res) => res.json(await request_service_1.requestService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await request_service_1.requestService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        ok(res);
    },
    duplicate: async (req, res) => res.json(await request_service_1.requestService.duplicate((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    move: async (req, res) => {
        await request_service_1.requestService.move((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body);
        ok(res);
    },
};
