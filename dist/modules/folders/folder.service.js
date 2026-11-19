"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.folderService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const object_1 = require("../../core/utils/object");
const collection_renderer_1 = require("../../shared/postman/collection.renderer");
const collection_access_1 = require("../collections/collection.access");
const collection_service_1 = require("../collections/collection.service");
const transfer_service_1 = require("../transfer/transfer.service");
const ordered = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
async function subtreeIds(folderId) {
    const children = await prisma_1.prisma.folder.findMany({ where: { parentId: folderId }, select: { id: true } });
    const nested = await Promise.all(children.map((c) => subtreeIds(c.id)));
    return [folderId, ...nested.flat()];
}
exports.folderService = {
    async create(userId, input) {
        await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        if (input.id) {
            const existing = await prisma_1.prisma.folder.findUnique({ where: { id: input.id } });
            if (existing)
                return existing;
        }
        const parentId = input.parentId || null;
        if (parentId)
            await (0, collection_access_1.assertFolderAccess)(userId, parentId);
        const count = await prisma_1.prisma.folder.count({ where: { collectionId: input.collectionId, parentId } });
        return prisma_1.prisma.folder.create({
            data: {
                ...(input.id ? { id: input.id } : {}),
                collectionId: input.collectionId,
                parentId,
                name: input.name,
                description: '',
                auth: { type: 'inherit' },
                preRequestScript: '',
                testScript: '',
                sortOrder: count,
            },
        });
    },
    get: (userId, id) => (0, collection_access_1.assertFolderAccess)(userId, id),
    async update(userId, id, input) {
        await (0, collection_access_1.assertFolderAccess)(userId, id);
        return prisma_1.prisma.folder.update({ where: { id }, data: input });
    },
    async remove(userId, id) {
        await (0, collection_access_1.assertFolderAccess)(userId, id);
        await prisma_1.prisma.folder.delete({ where: { id } });
    },
    /** Deep copy placed after the original's siblings. */
    async duplicate(userId, id) {
        const folder = await (0, collection_access_1.assertFolderAccess)(userId, id);
        const json = await collection_service_1.collectionService.toPostman(folder.collectionId);
        const item = (0, collection_renderer_1.findItem)(json.item, folder.id);
        const position = await prisma_1.prisma.folder.count({ where: { collectionId: folder.collectionId, parentId: folder.parentId } });
        await transfer_service_1.transferService.importItems(folder.collectionId, folder.parentId, [{ ...item, name: `${folder.name} Copy` }], position);
    },
    /** Drag & drop: re-parent (possibly into another collection) and reorder. */
    async move(userId, id, input) {
        const folder = await (0, collection_access_1.assertFolderAccess)(userId, id);
        await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        const subtree = await subtreeIds(folder.id);
        if (input.parentId) {
            const target = await (0, collection_access_1.assertFolderAccess)(userId, input.parentId);
            if (target.collectionId !== input.collectionId)
                throw (0, http_error_1.BadRequest)('Folder is not in that collection');
            if (subtree.includes(input.parentId))
                throw (0, http_error_1.BadRequest)('Cannot move a folder into itself');
        }
        await prisma_1.prisma.folder.update({ where: { id }, data: { parentId: input.parentId, collectionId: input.collectionId } });
        if (folder.collectionId !== input.collectionId) {
            await prisma_1.prisma.folder.updateMany({ where: { id: { in: subtree } }, data: { collectionId: input.collectionId } });
            await prisma_1.prisma.request.updateMany({ where: { folderId: { in: subtree } }, data: { collectionId: input.collectionId } });
        }
        const siblings = await prisma_1.prisma.folder.findMany({
            where: { collectionId: input.collectionId, parentId: input.parentId },
            orderBy: ordered,
            select: { id: true },
        });
        const ids = (0, object_1.reorder)(siblings.map((s) => s.id), id, input.index);
        await prisma_1.prisma.$transaction(ids.map((fid, i) => prisma_1.prisma.folder.update({ where: { id: fid }, data: { sortOrder: i } })));
    },
};
