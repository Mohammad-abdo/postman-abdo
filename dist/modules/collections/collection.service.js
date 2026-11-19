"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.collectionService = void 0;
const prisma_1 = require("../../core/database/prisma");
const object_1 = require("../../core/utils/object");
const collection_renderer_1 = require("../../shared/postman/collection.renderer");
const workspace_access_1 = require("../workspaces/workspace.access");
const limits_service_1 = require("../platform/limits.service");
const transfer_service_1 = require("../transfer/transfer.service");
const collection_access_1 = require("./collection.access");
const ordered = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
exports.collectionService = {
    async create(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        if (input.id) {
            const existing = await prisma_1.prisma.collection.findUnique({ where: { id: input.id } });
            if (existing)
                return existing;
        }
        await limits_service_1.limitsService.assertCanCreateCollection(input.workspaceId);
        const count = await prisma_1.prisma.collection.count({ where: { workspaceId: input.workspaceId } });
        return prisma_1.prisma.collection.create({
            data: {
                ...(input.id ? { id: input.id } : {}),
                workspaceId: input.workspaceId,
                projectId: input.projectId || null,
                name: input.name,
                description: input.description || '',
                auth: { type: 'noauth' },
                variables: [],
                preRequestScript: '',
                testScript: '',
                sortOrder: count,
            },
        });
    },
    get: (userId, id) => (0, collection_access_1.assertCollectionAccess)(userId, id),
    async update(userId, id, input) {
        await (0, collection_access_1.assertCollectionAccess)(userId, id);
        return prisma_1.prisma.collection.update({ where: { id }, data: input });
    },
    /** Deleting moves the collection to Trash, like Postman. */
    async moveToTrash(userId, id) {
        await (0, collection_access_1.assertCollectionAccess)(userId, id);
        await prisma_1.prisma.collection.update({ where: { id }, data: { deletedAt: new Date() } });
    },
    async trash(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        return prisma_1.prisma.collection.findMany({ where: { workspaceId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } });
    },
    async restore(userId, id) {
        await (0, collection_access_1.assertCollectionAccess)(userId, id);
        return prisma_1.prisma.collection.update({ where: { id }, data: { deletedAt: null } });
    },
    async destroy(userId, id) {
        await (0, collection_access_1.assertCollectionAccess)(userId, id);
        await prisma_1.prisma.collection.delete({ where: { id } });
    },
    async setPosition(userId, id, index) {
        const collection = await (0, collection_access_1.assertCollectionAccess)(userId, id);
        const siblings = await prisma_1.prisma.collection.findMany({
            where: { workspaceId: collection.workspaceId, deletedAt: null },
            orderBy: ordered,
            select: { id: true },
        });
        const ids = (0, object_1.reorder)(siblings.map((s) => s.id), id, index);
        await prisma_1.prisma.$transaction(ids.map((cid, i) => prisma_1.prisma.collection.update({ where: { id: cid }, data: { sortOrder: i } })));
    },
    async duplicate(userId, id) {
        const collection = await (0, collection_access_1.assertCollectionAccess)(userId, id);
        const json = await this.toPostman(id);
        return transfer_service_1.transferService.importCollection(collection.workspaceId, json, `${collection.name} Copy`);
    },
    async export(userId, id) {
        const collection = await (0, collection_access_1.assertCollectionAccess)(userId, id);
        return { name: collection.name, json: await this.toPostman(id) };
    },
    /** Loads a collection and renders it as Postman Collection v2.1 JSON. */
    async toPostman(id, opts = {}) {
        const collection = await prisma_1.prisma.collection.findUniqueOrThrow({ where: { id } });
        const [folders, requests] = await Promise.all([
            prisma_1.prisma.folder.findMany({ where: { collectionId: id }, orderBy: ordered }),
            prisma_1.prisma.request.findMany({
                where: { collectionId: id },
                orderBy: ordered,
                include: { examples: { orderBy: { sortOrder: 'asc' } } },
            }),
        ]);
        return (0, collection_renderer_1.renderCollection)(collection, folders, requests, opts);
    },
};
