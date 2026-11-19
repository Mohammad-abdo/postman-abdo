"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const history_service_1 = require("./history.service");
exports.historyController = {
    list: async (req, res) => res.json(await history_service_1.historyService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''), Number(req.query.limit) || undefined)),
    clear: async (req, res) => {
        await history_service_1.historyService.clear((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''));
        res.json({ ok: true });
    },
    removeMany: async (req, res) => {
        await history_service_1.historyService.removeMany((0, auth_middleware_1.currentUserId)(req), req.body.ids);
        res.json({ ok: true });
    },
};
