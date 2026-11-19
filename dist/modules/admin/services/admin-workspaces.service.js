"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminWorkspacesService = void 0;
const prisma_1 = require("../../../core/database/prisma");
const http_error_1 = require("../../../core/errors/http-error");
const limits_service_1 = require("../../platform/limits.service");
const userBrief = { select: { id: true, name: true, email: true, avatarUrl: true } };
async function findOrThrow(id) {
    const workspace = await prisma_1.prisma.workspace.findUnique({ where: { id } });
    if (!workspace)
        throw (0, http_error_1.NotFound)('Workspace not found');
    return workspace;
}
exports.adminWorkspacesService = {
    async list(query) {
        const where = query.q ? { OR: [{ name: { contains: query.q } }, { id: query.q }] } : {};
        const [total, workspaces] = await Promise.all([
            prisma_1.prisma.workspace.count({ where }),
            prisma_1.prisma.workspace.findMany({
                where,
                include: { _count: { select: { members: true, collections: true, projects: true, environments: true } } },
                orderBy: { createdAt: query.order },
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
        ]);
        const owners = await prisma_1.prisma.user.findMany({ where: { id: { in: workspaces.map((w) => w.ownerId) } }, ...userBrief });
        const ownerById = new Map(owners.map((o) => [o.id, o]));
        const items = await Promise.all(workspaces.map(async ({ _count, ...w }) => ({
            ...w,
            owner: ownerById.get(w.ownerId) || null,
            effectiveMemberLimit: await limits_service_1.limitsService.memberLimit(w.id),
            ..._count,
        })));
        return { total, page: query.page, pageSize: query.pageSize, items };
    },
    async detail(id) {
        const workspace = await prisma_1.prisma.workspace.findUnique({
            where: { id },
            include: {
                members: { include: { user: userBrief } },
                projects: { include: { _count: { select: { members: true, collections: true, environments: true } } } },
                collections: { where: { deletedAt: null }, select: { id: true, name: true, projectId: true, createdAt: true, _count: { select: { requests: true, folders: true } } } },
                _count: { select: { environments: true, mocks: true, monitors: true, history: true } },
            },
        });
        if (!workspace)
            throw (0, http_error_1.NotFound)('Workspace not found');
        const owner = await prisma_1.prisma.user.findUnique({ where: { id: workspace.ownerId }, ...userBrief });
        return { ...workspace, owner, effectiveMemberLimit: await limits_service_1.limitsService.memberLimit(id) };
    },
    async update(id, input) {
        await findOrThrow(id);
        return prisma_1.prisma.workspace.update({ where: { id }, data: input });
    },
    async removeMember(id, userId) {
        const workspace = await findOrThrow(id);
        if (workspace.ownerId === userId)
            throw (0, http_error_1.BadRequest)('Transfer ownership before removing the owner');
        await prisma_1.prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId } });
        await prisma_1.prisma.projectMember.deleteMany({ where: { userId, project: { workspaceId: id } } });
    },
    async transferOwnership(id, userId) {
        await findOrThrow(id);
        const member = await prisma_1.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
        if (!member)
            throw (0, http_error_1.BadRequest)('The new owner must be a member of the workspace');
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.workspace.update({ where: { id }, data: { ownerId: userId } }),
            prisma_1.prisma.workspaceMember.update({ where: { id: member.id }, data: { role: 'admin' } }),
        ]);
    },
    async remove(id) {
        await findOrThrow(id);
        await prisma_1.prisma.workspace.delete({ where: { id } });
    },
};
