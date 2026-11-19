"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.workspaceService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const limits_service_1 = require("../platform/limits.service");
const workspace_access_1 = require("./workspace.access");
const memberUser = { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true, lastSeenAt: true } };
exports.workspaceService = {
    list(userId) {
        return prisma_1.prisma.workspace.findMany({
            where: { members: { some: { userId } } },
            orderBy: { createdAt: 'asc' },
            include: { members: { include: { user: memberUser } } },
        });
    },
    /** The workspace every new account gets (not counted against the limit check). */
    createPersonal(userId) {
        return this.insert(userId, { name: 'My Workspace', type: 'personal' });
    },
    async create(userId, input) {
        if (input.id) {
            const existing = await prisma_1.prisma.workspace.findUnique({ where: { id: input.id } });
            if (existing)
                return existing;
        }
        await limits_service_1.limitsService.assertCanCreateWorkspace(userId);
        return this.insert(userId, input);
    },
    /** Every workspace starts with its Globals scope, like Postman. */
    insert(userId, input) {
        return prisma_1.prisma.workspace.create({
            data: {
                ...(input.id ? { id: input.id } : {}),
                name: input.name || 'Untitled Workspace',
                description: input.description || '',
                type: input.type || 'personal',
                ownerId: userId,
                members: { create: { userId, role: 'admin' } },
                environments: { create: { name: 'Globals', isGlobal: true, variables: [] } },
            },
        });
    },
    async update(userId, id, input) {
        await (0, workspace_access_1.assertWorkspaceAdmin)(userId, id);
        return prisma_1.prisma.workspace.update({ where: { id }, data: input });
    },
    async remove(userId, id) {
        await (0, workspace_access_1.assertWorkspaceAdmin)(userId, id);
        if ((await prisma_1.prisma.workspaceMember.count({ where: { userId } })) <= 1) {
            throw (0, http_error_1.BadRequest)('You cannot delete your only workspace');
        }
        await prisma_1.prisma.workspace.delete({ where: { id } });
    },
    async addMember(userId, id, input) {
        await (0, workspace_access_1.assertWorkspaceAdmin)(userId, id);
        const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
        if (!user)
            throw (0, http_error_1.NotFound)('No user with this email exists');
        const alreadyMember = await prisma_1.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: user.id } } });
        if (!alreadyMember)
            await limits_service_1.limitsService.assertCanAddMember(id);
        await prisma_1.prisma.workspaceMember.upsert({
            where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
            create: { workspaceId: id, userId: user.id, role: input.role },
            update: { role: input.role },
        });
        await prisma_1.prisma.workspace.update({ where: { id }, data: { type: 'team' } });
        return {
            result: { userId: user.id, role: input.role },
            event: {
                type: alreadyMember ? 'workspace.member_role_changed' : 'workspace.member_added',
                actorId: userId,
                workspaceId: id,
                targetUserIds: [user.id],
                role: input.role,
            },
        };
    },
    /** Admins remove members; any member can remove themselves (leave). The owner always stays. */
    async removeMember(userId, id, memberId) {
        if (memberId === userId)
            await (0, workspace_access_1.assertWorkspaceMember)(userId, id);
        else
            await (0, workspace_access_1.assertWorkspaceAdmin)(userId, id);
        const workspace = await prisma_1.prisma.workspace.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
        if (memberId === workspace.ownerId)
            throw (0, http_error_1.BadRequest)('The workspace owner cannot be removed or leave the workspace');
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.projectMember.deleteMany({ where: { userId: memberId, project: { workspaceId: id } } }),
            prisma_1.prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId: memberId } }),
        ]);
        return {
            result: { ok: true },
            event: { type: memberId === userId ? 'workspace.member_left' : 'workspace.member_removed', actorId: userId, workspaceId: id, targetUserIds: [memberId] },
        };
    },
    async updateMember(userId, id, memberId, input) {
        await (0, workspace_access_1.assertWorkspaceAdmin)(userId, id);
        const workspace = await prisma_1.prisma.workspace.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
        if (memberId === workspace.ownerId && input.role !== 'admin')
            throw (0, http_error_1.Forbidden)('The workspace owner is always an admin');
        const member = await prisma_1.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: memberId } } });
        if (!member)
            throw (0, http_error_1.NotFound)('Member not found');
        const updated = await prisma_1.prisma.workspaceMember.update({ where: { id: member.id }, data: { role: input.role } });
        return {
            result: updated,
            event: { type: 'workspace.member_role_changed', actorId: userId, workspaceId: id, targetUserIds: [memberId], role: input.role },
        };
    },
    /** Everything the workspace page shows: members, limit, counts and projects. */
    async overview(userId, id) {
        const membership = await (0, workspace_access_1.assertWorkspaceMember)(userId, id);
        const [workspace, memberLimit, collections, environments, requests, projects] = await Promise.all([
            prisma_1.prisma.workspace.findUniqueOrThrow({
                where: { id },
                include: { members: { include: { user: memberUser }, orderBy: { id: 'asc' } } },
            }),
            limits_service_1.limitsService.memberLimit(id),
            prisma_1.prisma.collection.count({ where: { workspaceId: id, deletedAt: null } }),
            prisma_1.prisma.environment.count({ where: { workspaceId: id, isGlobal: false } }),
            prisma_1.prisma.request.count({ where: { collection: { workspaceId: id, deletedAt: null } } }),
            prisma_1.prisma.project.findMany({
                where: { workspaceId: id },
                orderBy: { createdAt: 'asc' },
                include: { _count: { select: { members: true, collections: true, environments: true } } },
            }),
        ]);
        return {
            workspace: { id: workspace.id, name: workspace.name, description: workspace.description, type: workspace.type, ownerId: workspace.ownerId, createdAt: workspace.createdAt },
            myRole: membership.role,
            members: workspace.members.map((m) => ({ userId: m.userId, role: m.role, isOwner: m.userId === workspace.ownerId, user: m.user })),
            memberLimit,
            counts: { members: workspace.members.length, collections, environments, requests, projects: projects.length },
            projects,
        };
    },
    /** Everything the sidebar needs in one round trip. */
    async tree(userId, id) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, id);
        const ordered = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];
        const collections = await prisma_1.prisma.collection.findMany({ where: { workspaceId: id, deletedAt: null }, orderBy: ordered });
        const collectionIds = collections.map((c) => c.id);
        const [folders, requests, examples] = await Promise.all([
            prisma_1.prisma.folder.findMany({ where: { collectionId: { in: collectionIds } }, orderBy: ordered }),
            prisma_1.prisma.request.findMany({ where: { collectionId: { in: collectionIds } }, orderBy: ordered }),
            prisma_1.prisma.example.findMany({
                where: { parent: { collectionId: { in: collectionIds } } },
                orderBy: ordered,
                select: { id: true, requestId: true, name: true, code: true, sortOrder: true },
            }),
        ]);
        return { collections, folders, requests, examples };
    },
    async search(userId, id, q) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, id);
        if (!q.trim())
            return [];
        const inWorkspace = { workspaceId: id, deletedAt: null };
        const [collections, folders, requests, environments] = await Promise.all([
            prisma_1.prisma.collection.findMany({ where: { ...inWorkspace, name: { contains: q } }, take: 20 }),
            prisma_1.prisma.folder.findMany({ where: { collection: inWorkspace, name: { contains: q } }, take: 20 }),
            prisma_1.prisma.request.findMany({
                where: { collection: inWorkspace, OR: [{ name: { contains: q } }, { url: { contains: q } }] },
                take: 30,
            }),
            prisma_1.prisma.environment.findMany({ where: { workspaceId: id, name: { contains: q } }, take: 20 }),
        ]);
        return [
            ...collections.map((c) => ({ kind: 'collection', id: c.id, name: c.name })),
            ...folders.map((f) => ({ kind: 'folder', id: f.id, name: f.name, collectionId: f.collectionId })),
            ...requests.map((r) => ({ kind: 'request', id: r.id, name: r.name, method: r.method, url: r.url, collectionId: r.collectionId, type: r.type })),
            ...environments.map((e) => ({ kind: 'environment', id: e.id, name: e.name, isGlobal: e.isGlobal })),
        ];
    },
};
