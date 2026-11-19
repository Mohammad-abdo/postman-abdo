"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.syncService = void 0;
const prisma_1 = require("../../core/database/prisma");
const workspace_access_1 = require("../workspaces/workspace.access");
exports.syncService = {
    /** Records that a device is alive and how many offline changes it still has to upload. */
    heartbeat(userId, input) {
        const data = {
            platform: input.platform,
            appVersion: input.appVersion,
            pendingOps: input.pendingOps,
            lastSyncAt: input.lastSyncAt ? new Date(input.lastSyncAt) : undefined,
            lastSeenAt: new Date(),
        };
        return prisma_1.prisma.syncDevice.upsert({
            where: { id: input.deviceId },
            create: { id: input.deviceId, userId, ...data },
            update: { ...data, userId },
        });
    },
    devices(userId) {
        return prisma_1.prisma.syncDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
    },
    /** Idempotent by id: replays of the same entry return the stored row. */
    async recordHistory(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        const existing = await prisma_1.prisma.historyItem.findUnique({ where: { id: input.id } });
        if (existing)
            return existing;
        return prisma_1.prisma.historyItem.create({
            data: {
                id: input.id,
                workspaceId: input.workspaceId,
                userId,
                method: input.method.toUpperCase(),
                url: input.url,
                name: input.name || null,
                request: (0, prisma_1.json)(input.request),
                response: input.response ? (0, prisma_1.json)(input.response) : undefined,
                createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
            },
        });
    },
};
