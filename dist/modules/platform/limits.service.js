"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.limitsService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const platform_service_1 = require("./platform.service");
const LimitReached = (message) => new http_error_1.HttpError(403, message);
const today = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
/** Enforces the free-plan limits configured in the admin dashboard. */
exports.limitsService = {
    /** Platform defaults merged with the user's personal overrides. */
    async forUser(userId) {
        const [settings, user] = await Promise.all([platform_service_1.platformService.settings(), prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { limits: true } })]);
        return { ...settings.defaultLimits, ...(user?.limits || {}) };
    },
    async assertCanCreateWorkspace(userId) {
        const [limits, owned] = await Promise.all([this.forUser(userId), prisma_1.prisma.workspace.count({ where: { ownerId: userId } })]);
        if (owned >= limits.maxWorkspaces)
            throw LimitReached(`You can own up to ${limits.maxWorkspaces} workspaces.`);
    },
    /** Workspace override wins; otherwise the owner's limit applies. */
    async memberLimit(workspaceId) {
        const workspace = await prisma_1.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerId: true, memberLimit: true } });
        if (workspace.memberLimit != null)
            return workspace.memberLimit;
        return (await this.forUser(workspace.ownerId)).maxMembersPerWorkspace;
    },
    async assertCanAddMember(workspaceId) {
        const [limit, members] = await Promise.all([this.memberLimit(workspaceId), prisma_1.prisma.workspaceMember.count({ where: { workspaceId } })]);
        if (members >= limit)
            throw LimitReached(`This workspace has reached its limit of ${limit} members.`);
    },
    async ownerLimits(workspaceId) {
        const workspace = await prisma_1.prisma.workspace.findUniqueOrThrow({ where: { id: workspaceId }, select: { ownerId: true } });
        return this.forUser(workspace.ownerId);
    },
    async assertCanCreateProject(workspaceId) {
        const [limits, count] = await Promise.all([this.ownerLimits(workspaceId), prisma_1.prisma.project.count({ where: { workspaceId } })]);
        if (count >= limits.maxProjectsPerWorkspace)
            throw LimitReached(`This workspace can have up to ${limits.maxProjectsPerWorkspace} projects.`);
    },
    async assertCanCreateCollection(workspaceId) {
        const [limits, count] = await Promise.all([this.ownerLimits(workspaceId), prisma_1.prisma.collection.count({ where: { workspaceId, deletedAt: null } })]);
        if (count >= limits.maxCollectionsPerWorkspace)
            throw LimitReached(`This workspace can have up to ${limits.maxCollectionsPerWorkspace} collections.`);
    },
    async assertCanCreateMonitor(workspaceId) {
        const [limits, count] = await Promise.all([this.ownerLimits(workspaceId), prisma_1.prisma.monitor.count({ where: { workspaceId } })]);
        if (count >= limits.maxMonitors)
            throw LimitReached(`This workspace can have up to ${limits.maxMonitors} monitors.`);
    },
    async assertCanCreateMock(workspaceId) {
        const [limits, count] = await Promise.all([this.ownerLimits(workspaceId), prisma_1.prisma.mockServer.count({ where: { workspaceId } })]);
        if (count >= limits.maxMockServers)
            throw LimitReached(`This workspace can have up to ${limits.maxMockServers} mock servers.`);
    },
    async assertCanUpload(userId, sizeBytes) {
        const [limits, used] = await Promise.all([this.forUser(userId), prisma_1.prisma.uploadedFile.aggregate({ where: { userId }, _sum: { size: true } })]);
        if (sizeBytes > limits.maxUploadMb * 1024 * 1024)
            throw LimitReached(`Files can be up to ${limits.maxUploadMb} MB.`);
        if ((used._sum.size || 0) + sizeBytes > limits.maxStorageMb * 1024 * 1024)
            throw LimitReached(`You have used your ${limits.maxStorageMb} MB of file storage.`);
    },
    /** Counts executed requests towards today's quota; throws once the quota is used up. */
    async consumeRequests(userId, count, kind = 'requests') {
        const limits = await this.forUser(userId);
        const usage = await prisma_1.prisma.usageDaily.upsert({
            where: { userId_date: { userId, date: today() } },
            create: { userId, date: today(), requests: count, runs: kind === 'runs' ? 1 : 0 },
            update: { requests: { increment: count }, ...(kind === 'runs' ? { runs: { increment: 1 } } : {}) },
        });
        if (usage.requests > limits.maxRequestsPerDay)
            throw LimitReached(`Daily limit of ${limits.maxRequestsPerDay} requests reached. It resets at midnight UTC.`);
    },
    async recordUsage(userId, { errors = 0, bytes = 0 }) {
        await prisma_1.prisma.usageDaily
            .update({ where: { userId_date: { userId, date: today() } }, data: { errors: { increment: errors }, bytesIn: { increment: BigInt(bytes) } } })
            .catch(() => undefined);
    },
    /** Usage numbers shown on the account page. */
    async summary(userId) {
        const [limits, todayUsage, ownedWorkspaces, storage] = await Promise.all([
            this.forUser(userId),
            prisma_1.prisma.usageDaily.findUnique({ where: { userId_date: { userId, date: today() } } }),
            prisma_1.prisma.workspace.count({ where: { ownerId: userId } }),
            prisma_1.prisma.uploadedFile.aggregate({ where: { userId }, _sum: { size: true }, _count: true }),
        ]);
        return {
            limits,
            usage: {
                requestsToday: todayUsage?.requests || 0,
                ownedWorkspaces,
                storageBytes: storage._sum.size || 0,
                files: storage._count,
            },
        };
    },
};
