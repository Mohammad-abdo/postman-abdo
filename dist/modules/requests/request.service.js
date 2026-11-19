"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const object_1 = require("../../core/utils/object");
const types_1 = require("../../shared/postman/types");
const collection_access_1 = require("../collections/collection.access");
const ordered = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
const defaults = () => ({
    type: 'http',
    name: 'New Request',
    method: 'GET',
    url: '',
    params: [],
    pathVariables: [],
    headers: [],
    body: (0, types_1.emptyBody)(),
    auth: { type: 'inherit' },
    preRequestScript: '',
    testScript: '',
    settings: {},
    description: '',
});
exports.requestService = {
    async create(userId, input) {
        const { collectionId, folderId, id, ...fields } = input;
        await (0, collection_access_1.assertCollectionAccess)(userId, collectionId);
        if (id) {
            const existing = await prisma_1.prisma.request.findUnique({ where: { id } });
            if (existing)
                return existing;
        }
        if (folderId)
            await (0, collection_access_1.assertFolderAccess)(userId, folderId);
        const count = await prisma_1.prisma.request.count({ where: { collectionId, folderId: folderId || null } });
        return prisma_1.prisma.request.create({
            data: { ...defaults(), ...fields, ...(id ? { id } : {}), collectionId, folderId: folderId || null, sortOrder: count },
        });
    },
    async get(userId, id) {
        await (0, collection_access_1.assertRequestAccess)(userId, id);
        return prisma_1.prisma.request.findUnique({ where: { id }, include: { examples: { orderBy: { sortOrder: 'asc' } } } });
    },
    async update(userId, id, input) {
        await (0, collection_access_1.assertRequestAccess)(userId, id);
        return prisma_1.prisma.request.update({ where: { id }, data: input });
    },
    async remove(userId, id) {
        await (0, collection_access_1.assertRequestAccess)(userId, id);
        await prisma_1.prisma.request.delete({ where: { id } });
    },
    /** Copies the request (and its examples) right below the original. */
    async duplicate(userId, id) {
        const original = await (0, collection_access_1.assertRequestAccess)(userId, id);
        const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = original;
        return prisma_1.prisma.$transaction(async (tx) => {
            await tx.request.updateMany({
                where: { collectionId: original.collectionId, folderId: original.folderId, sortOrder: { gt: original.sortOrder } },
                data: { sortOrder: { increment: 1 } },
            });
            const copy = await tx.request.create({
                data: { ...fields, name: `${original.name} Copy`, sortOrder: original.sortOrder + 1 },
            });
            const examples = await tx.example.findMany({ where: { requestId: id } });
            for (const { id: _eid, requestId: _rid, createdAt: _ec, updatedAt: _eu, ...example } of examples) {
                await tx.example.create({ data: { ...example, requestId: copy.id } });
            }
            return copy;
        });
    },
    async move(userId, id, input) {
        await (0, collection_access_1.assertRequestAccess)(userId, id);
        await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        if (input.folderId) {
            const folder = await (0, collection_access_1.assertFolderAccess)(userId, input.folderId);
            if (folder.collectionId !== input.collectionId)
                throw (0, http_error_1.BadRequest)('Folder is not in that collection');
        }
        await prisma_1.prisma.request.update({ where: { id }, data: { collectionId: input.collectionId, folderId: input.folderId } });
        const siblings = await prisma_1.prisma.request.findMany({
            where: { collectionId: input.collectionId, folderId: input.folderId },
            orderBy: ordered,
            select: { id: true },
        });
        const ids = (0, object_1.reorder)(siblings.map((s) => s.id), id, input.index);
        await prisma_1.prisma.$transaction(ids.map((rid, i) => prisma_1.prisma.request.update({ where: { id: rid }, data: { sortOrder: i } })));
    },
};
