"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyService = void 0;
const prisma_1 = require("../../core/database/prisma");
const workspace_access_1 = require("../workspaces/workspace.access");
exports.historyService = {
    async list(userId, workspaceId, limit = 300) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        return prisma_1.prisma.historyItem.findMany({ where: { workspaceId, userId }, orderBy: { createdAt: 'desc' }, take: limit });
    },
    /** Stores the request without its collection linkage, like Postman's history. */
    record({ workspaceId, userId, request, response }) {
        const { id: _id, collectionId: _c, folderId: _f, ...snapshot } = request;
        return prisma_1.prisma.historyItem.create({
            data: {
                workspaceId,
                userId,
                method: String(request.method || 'GET').toUpperCase(),
                url: String(request.url || ''),
                name: request.name || null,
                request: (0, prisma_1.json)(snapshot),
                response: response ? (0, prisma_1.json)(response) : undefined,
            },
        });
    },
    async clear(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        await prisma_1.prisma.historyItem.deleteMany({ where: { workspaceId, userId } });
    },
    async removeMany(userId, ids) {
        await prisma_1.prisma.historyItem.deleteMany({ where: { id: { in: ids }, userId } });
    },
};
