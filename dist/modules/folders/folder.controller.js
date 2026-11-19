"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.folderController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const folder_service_1 = require("./folder.service");
const ok = (res) => res.json({ ok: true });
exports.folderController = {
    create: async (req, res) => res.json(await folder_service_1.folderService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    get: async (req, res) => res.json(await folder_service_1.folderService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    update: async (req, res) => res.json(await folder_service_1.folderService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await folder_service_1.folderService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        ok(res);
    },
    duplicate: async (req, res) => {
        await folder_service_1.folderService.duplicate((0, auth_middleware_1.currentUserId)(req), req.params.id);
        ok(res);
    },
    move: async (req, res) => {
        await folder_service_1.folderService.move((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body);
        ok(res);
    },
};
