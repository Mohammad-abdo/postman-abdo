"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exampleController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const example_service_1 = require("./example.service");
exports.exampleController = {
    create: async (req, res) => res.json(await example_service_1.exampleService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    get: async (req, res) => res.json(await example_service_1.exampleService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    update: async (req, res) => res.json(await example_service_1.exampleService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await example_service_1.exampleService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
    duplicate: async (req, res) => res.json(await example_service_1.exampleService.duplicate((0, auth_middleware_1.currentUserId)(req), req.params.id)),
};
