"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const workspace_access_1 = require("../workspaces/workspace.access");
/** Stored results of collection runs (runner and monitors). */
exports.runService = {
    async list(userId, workspaceId, collectionId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        return prisma_1.prisma.collectionRun.findMany({
            where: { workspaceId, ...(collectionId ? { collectionId } : {}) },
            orderBy: { createdAt: 'desc' },
            take: 50,
            select: { id: true, name: true, source: true, stats: true, createdAt: true, collectionId: true, monitorId: true },
        });
    },
    async get(userId, id) {
        const run = await prisma_1.prisma.collectionRun.findUnique({ where: { id } });
        if (!run)
            throw (0, http_error_1.NotFound)('Run not found');
        await (0, workspace_access_1.assertWorkspaceMember)(userId, run.workspaceId);
        return run;
    },
    async remove(userId, id) {
        await this.get(userId, id);
        await prisma_1.prisma.collectionRun.delete({ where: { id } });
    },
};
