"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const workspace_event_notifier_1 = require("../notifications/workspace-event.notifier");
const workspace_service_1 = require("./workspace.service");
exports.workspaceController = {
    list: async (req, res) => res.json(await workspace_service_1.workspaceService.list((0, auth_middleware_1.currentUserId)(req))),
    create: async (req, res) => res.json(await workspace_service_1.workspaceService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    update: async (req, res) => res.json(await workspace_service_1.workspaceService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await workspace_service_1.workspaceService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.json({ ok: true });
    },
    // Member mutations return `{ result, event }`; the event becomes notifications for everyone affected.
    addMember: async (req, res) => {
        const result = (0, workspace_event_notifier_1.withNotification)(await workspace_service_1.workspaceService.addMember((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body));
        res.json({ ok: true, ...result });
    },
    removeMember: async (req, res) => {
        res.json((0, workspace_event_notifier_1.withNotification)(await workspace_service_1.workspaceService.removeMember((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.userId)));
    },
    updateMember: async (req, res) => {
        res.json((0, workspace_event_notifier_1.withNotification)(await workspace_service_1.workspaceService.updateMember((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.userId, req.body)));
    },
    overview: async (req, res) => res.json(await workspace_service_1.workspaceService.overview((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    tree: async (req, res) => res.json(await workspace_service_1.workspaceService.tree((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    search: async (req, res) => res.json(await workspace_service_1.workspaceService.search((0, auth_middleware_1.currentUserId)(req), req.params.id, String(req.query.q || ''))),
};
