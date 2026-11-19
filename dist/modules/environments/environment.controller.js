"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environmentController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const object_1 = require("../../core/utils/object");
const environment_service_1 = require("./environment.service");
exports.environmentController = {
    list: async (req, res) => res.json(await environment_service_1.environmentService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    create: async (req, res) => res.json(await environment_service_1.environmentService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    update: async (req, res) => res.json(await environment_service_1.environmentService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await environment_service_1.environmentService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
    duplicate: async (req, res) => res.json(await environment_service_1.environmentService.duplicate((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    export: async (req, res) => {
        const json = await environment_service_1.environmentService.export((0, auth_middleware_1.currentUserId)(req), req.params.id);
        const suffix = json._postman_variable_scope === 'globals' ? 'postman_globals' : 'postman_environment';
        res.setHeader('Content-Disposition', `attachment; filename="${(0, object_1.safeFileName)(json.name)}.${suffix}.json"`);
        res.json(json);
    },
};
