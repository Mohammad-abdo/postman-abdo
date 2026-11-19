"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const object_1 = require("../../core/utils/object");
const collection_service_1 = require("./collection.service");
const ok = (res) => res.json({ ok: true });
exports.collectionController = {
    create: async (req, res) => res.json(await collection_service_1.collectionService.create((0, auth_middleware_1.currentUserId)(req), req.body)),
    get: async (req, res) => res.json(await collection_service_1.collectionService.get((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    update: async (req, res) => res.json(await collection_service_1.collectionService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    remove: async (req, res) => {
        await collection_service_1.collectionService.moveToTrash((0, auth_middleware_1.currentUserId)(req), req.params.id);
        ok(res);
    },
    trash: async (req, res) => res.json(await collection_service_1.collectionService.trash((0, auth_middleware_1.currentUserId)(req), req.params.workspaceId)),
    restore: async (req, res) => res.json(await collection_service_1.collectionService.restore((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    destroy: async (req, res) => {
        await collection_service_1.collectionService.destroy((0, auth_middleware_1.currentUserId)(req), req.params.id);
        ok(res);
    },
    setPosition: async (req, res) => {
        await collection_service_1.collectionService.setPosition((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body.index);
        ok(res);
    },
    duplicate: async (req, res) => res.json(await collection_service_1.collectionService.duplicate((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    export: async (req, res) => {
        const { name, json } = await collection_service_1.collectionService.export((0, auth_middleware_1.currentUserId)(req), req.params.id);
        res.setHeader('Content-Disposition', `attachment; filename="${(0, object_1.safeFileName)(name)}.postman_collection.json"`);
        res.json(json);
    },
};
