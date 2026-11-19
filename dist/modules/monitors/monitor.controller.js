"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const monitor_service_1 = require("./monitor.service");
exports.monitorController = {
    list: async (req, res) => res.json(await monitor_service_1.monitorService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    create: async (req, res) => res.json(await monitor_service_1.monitorService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    update: async (req, res) => res.json(await monitor_service_1.monitorService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await monitor_service_1.monitorService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
    runNow: async (req, res) => res.json(await monitor_service_1.monitorService.runNow((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    run: async (req, res) => res.json(await monitor_service_1.monitorService.run((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.runId)),
    runs: async (req, res) => res.json(await monitor_service_1.monitorService.runs((0, auth_middleware_1.currentUserId)(req), req.params.id)),
};
