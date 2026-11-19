"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const sync_service_1 = require("./sync.service");
exports.syncController = {
    heartbeat: async (req, res) => res.json(await sync_service_1.syncService.heartbeat((0, auth_middleware_1.currentUserId)(req), req.body)),
    devices: async (req, res) => res.json(await sync_service_1.syncService.devices((0, auth_middleware_1.currentUserId)(req))),
    recordHistory: async (req, res) => res.json(await sync_service_1.syncService.recordHistory((0, auth_middleware_1.currentUserId)(req), req.body)),
};
