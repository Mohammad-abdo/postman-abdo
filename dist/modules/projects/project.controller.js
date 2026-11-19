"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const workspace_event_notifier_1 = require("../notifications/workspace-event.notifier");
const project_service_1 = require("./project.service");
/**
 * Mutations that change who is in a project return `{ result, event }` from the service;
 * `withNotification` turns the event into notifications for everyone affected.
 */
exports.projectController = {
    list: async (req, res) => res.json(await project_service_1.projectService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    get: async (req, res) => res.json(await project_service_1.projectService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    create: async (req, res) => res.json((0, workspace_event_notifier_1.withNotification)(await project_service_1.projectService.create((0, auth_middleware_1.currentUserId)(req), req.body))),
    update: async (req, res) => res.json(await project_service_1.projectService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => res.json((0, workspace_event_notifier_1.withNotification)(await project_service_1.projectService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id))),
    members: async (req, res) => res.json(await project_service_1.projectService.members((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    addMembers: async (req, res) => res.json((0, workspace_event_notifier_1.withNotification)(await project_service_1.projectService.addMembers((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body))),
    updateMember: async (req, res) => res.json((0, workspace_event_notifier_1.withNotification)(await project_service_1.projectService.updateMember((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.userId, req.body.role))),
    removeMember: async (req, res) => res.json((0, workspace_event_notifier_1.withNotification)(await project_service_1.projectService.removeMember((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.userId))),
    attachCollection: async (req, res) => res.json(await project_service_1.projectService.setCollection((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.collectionId, true)),
    detachCollection: async (req, res) => res.json(await project_service_1.projectService.setCollection((0, auth_middleware_1.currentUserId)(req), req.params.id, req.params.collectionId, false)),
};
