"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.projectService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const limits_service_1 = require("../platform/limits.service");
const workspace_access_1 = require("../workspaces/workspace.access");
const memberUser = { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } };
/** The three environments every project starts with. */
const STAGES = [
    { stage: 'local', name: 'Local', defaultUrl: 'http://localhost:3000' },
    { stage: 'development', name: 'Development', defaultUrl: 'https://dev.example.com' },
    { stage: 'production', name: 'Production', defaultUrl: 'https://api.example.com' },
];
const baseUrlVariable = (value) => [{ key: 'baseUrl', value, currentValue: '', type: 'default', enabled: true, description: 'Root URL of the API' }];
/** Variables for one stage: the guided setup's exact list, or the default `baseUrl`. */
function stageVariables(input, stage) {
    const custom = input.environments?.find((e) => e.stage === stage.stage);
    if (!custom)
        return baseUrlVariable(input.baseUrls[stage.stage] || stage.defaultUrl);
    return custom.variables.map((v) => ({ key: v.key, value: v.value, currentValue: '', type: v.type, enabled: true, description: '' }));
}
/**
 * Project permissions, derived from the workspace role and the project role:
 * - see:    workspace admins/editors see every project; others only projects they belong to
 * - invite: workspace admins/editors (any project), project admins — viewers never
 * - edit:   workspace admins, project admins/editors (collections, environments)
 * - manage: workspace admins, project admins (details, member roles/removal, delete)
 */
async function projectAccess(userId, projectId) {
    const project = await prisma_1.prisma.project.findUnique({ where: { id: projectId } });
    if (!project)
        throw (0, http_error_1.NotFound)('Project not found');
    const workspaceRole = (await (0, workspace_access_1.assertWorkspaceMember)(userId, project.workspaceId)).role;
    const projectRole = (await prisma_1.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }))?.role || null;
    const workspaceWide = workspaceRole === 'admin' || workspaceRole === 'editor';
    if (!workspaceWide && !projectRole)
        throw (0, http_error_1.NotFound)('Project not found');
    const canManage = workspaceRole === 'admin' || projectRole === 'admin';
    return {
        project,
        workspaceRole,
        projectRole,
        canManage,
        canEdit: canManage || projectRole === 'editor',
        canInvite: workspaceRole !== 'viewer' && (workspaceWide || projectRole === 'admin'),
    };
}
async function assertCan(userId, projectId, ability) {
    const access = await projectAccess(userId, projectId);
    if (!access[ability])
        throw (0, http_error_1.Forbidden)(ability === 'canInvite' ? 'Your workspace role cannot invite people to projects' : 'Only project admins can do this');
    return access;
}
async function workspaceMemberIds(workspaceId) {
    return (await prisma_1.prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } })).map((m) => m.userId);
}
async function assertWorkspaceUsers(workspaceId, userIds) {
    const members = new Set(await workspaceMemberIds(workspaceId));
    if (userIds.some((id) => !members.has(id))) {
        throw (0, http_error_1.BadRequest)('Only members of this workspace can be added to the project. Invite them to the workspace first.');
    }
}
const memberIdsOf = async (projectId) => (await prisma_1.prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } })).map((m) => m.userId);
exports.projectService = {
    /** Projects of a workspace the user can see. */
    async list(userId, workspaceId) {
        const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        const seesAll = member.role === 'admin' || member.role === 'editor';
        return prisma_1.prisma.project.findMany({
            where: { workspaceId, ...(seesAll ? {} : { members: { some: { userId } } }) },
            orderBy: { createdAt: 'asc' },
            include: {
                members: { include: { user: memberUser } },
                _count: { select: { collections: true, environments: true } },
            },
        });
    },
    async get(userId, id) {
        const { canManage, canEdit, canInvite, projectRole } = await projectAccess(userId, id);
        const project = await prisma_1.prisma.project.findUniqueOrThrow({
            where: { id },
            include: {
                members: { include: { user: memberUser } },
                collections: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, updatedAt: true } },
                environments: { orderBy: { createdAt: 'asc' } },
            },
        });
        return { ...project, canManage, canEdit, canInvite, myRole: projectRole };
    },
    async create(userId, input) {
        const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        if (member.role === 'viewer')
            throw (0, http_error_1.Forbidden)('Viewers cannot create projects');
        if (input.id) {
            const existing = await prisma_1.prisma.project.findUnique({ where: { id: input.id } });
            if (existing)
                return { result: await this.get(userId, existing.id), event: null };
        }
        await limits_service_1.limitsService.assertCanCreateProject(input.workspaceId);
        const invited = input.addAllMembers ? await workspaceMemberIds(input.workspaceId) : input.memberIds;
        const others = [...new Set(invited)].filter((m) => m !== userId);
        await assertWorkspaceUsers(input.workspaceId, others);
        const project = await prisma_1.prisma.$transaction(async (tx) => {
            const created = await tx.project.create({
                data: {
                    ...(input.id ? { id: input.id } : {}),
                    workspaceId: input.workspaceId,
                    name: input.name,
                    description: input.description || '',
                    color: input.color,
                    createdById: userId,
                    members: { create: [{ userId, role: 'admin' }, ...others.map((m) => ({ userId: m, role: 'editor' }))] },
                },
            });
            for (const s of STAGES) {
                await tx.environment.create({
                    data: {
                        workspaceId: input.workspaceId,
                        projectId: created.id,
                        stage: s.stage,
                        name: `${input.name} · ${s.name}`,
                        variables: (0, prisma_1.json)(stageVariables(input, s)),
                    },
                });
            }
            if (input.collectionIds.length) {
                await tx.collection.updateMany({ where: { id: { in: input.collectionIds }, workspaceId: input.workspaceId }, data: { projectId: created.id } });
            }
            if (input.initialCollection) {
                const count = await tx.collection.count({ where: { workspaceId: input.workspaceId } });
                await tx.collection.create({
                    data: {
                        workspaceId: input.workspaceId,
                        projectId: created.id,
                        name: input.initialCollection,
                        description: '',
                        auth: { type: 'noauth' },
                        variables: [],
                        preRequestScript: '',
                        testScript: '',
                        sortOrder: count,
                    },
                });
            }
            return created;
        });
        return {
            result: await this.get(userId, project.id),
            event: { type: 'project.created', actorId: userId, workspaceId: input.workspaceId, projectId: project.id, projectName: project.name, targetUserIds: others },
        };
    },
    async update(userId, id, input) {
        await assertCan(userId, id, 'canManage');
        return prisma_1.prisma.project.update({ where: { id }, data: input });
    },
    /** Collections are kept (moved out of the project); the project's environments are removed with it. */
    async remove(userId, id) {
        const { project } = await assertCan(userId, id, 'canManage');
        const members = (await memberIdsOf(id)).filter((m) => m !== userId);
        await prisma_1.prisma.$transaction([
            prisma_1.prisma.collection.updateMany({ where: { projectId: id }, data: { projectId: null } }),
            prisma_1.prisma.project.delete({ where: { id } }),
        ]);
        return {
            result: { ok: true },
            event: { type: 'project.deleted', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: members },
        };
    },
    async members(userId, id) {
        await projectAccess(userId, id);
        return prisma_1.prisma.projectMember.findMany({ where: { projectId: id }, include: { user: memberUser } });
    },
    /**
     * Adds workspace members to a project: specific people (`userIds`) or the whole team (`all`).
     * Existing members keep their role. Returns who was actually added.
     */
    async addMembers(userId, id, input) {
        const { project } = await assertCan(userId, id, 'canInvite');
        const candidates = input.all ? await workspaceMemberIds(project.workspaceId) : [...new Set(input.userIds)];
        await assertWorkspaceUsers(project.workspaceId, candidates);
        const existing = new Set(await memberIdsOf(id));
        const added = candidates.filter((m) => !existing.has(m));
        if (added.length) {
            await prisma_1.prisma.projectMember.createMany({ data: added.map((m) => ({ projectId: id, userId: m, role: input.role })), skipDuplicates: true });
        }
        return {
            result: { added },
            event: added.length
                ? { type: 'project.member_added', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: added, role: input.role }
                : null,
        };
    },
    async updateMember(userId, id, memberId, role) {
        const { project } = await assertCan(userId, id, 'canManage');
        const member = await prisma_1.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
        if (!member)
            throw (0, http_error_1.NotFound)('Member not found');
        if (member.role === 'admin' && role !== 'admin') {
            const otherAdmins = await prisma_1.prisma.projectMember.count({ where: { projectId: id, role: 'admin', userId: { not: memberId } } });
            if (!otherAdmins)
                throw (0, http_error_1.BadRequest)('A project needs at least one admin');
        }
        const updated = await prisma_1.prisma.projectMember.update({ where: { id: member.id }, data: { role } });
        return {
            result: updated,
            event: { type: 'project.member_role_changed', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: [memberId], role },
        };
    },
    /** Managers remove anyone; members can leave. A project always keeps at least one admin. */
    async removeMember(userId, id, memberId) {
        const { project } = memberId === userId ? await projectAccess(userId, id) : await assertCan(userId, id, 'canManage');
        const target = await prisma_1.prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
        if (!target)
            throw (0, http_error_1.NotFound)('Member not found');
        const otherAdmins = await prisma_1.prisma.projectMember.count({ where: { projectId: id, role: 'admin', userId: { not: memberId } } });
        if (target.role === 'admin' && otherAdmins === 0)
            throw (0, http_error_1.BadRequest)('A project needs at least one admin');
        await prisma_1.prisma.projectMember.delete({ where: { id: target.id } });
        return {
            result: { ok: true },
            event: {
                type: memberId === userId ? 'project.member_left' : 'project.member_removed',
                actorId: userId,
                workspaceId: project.workspaceId,
                projectId: id,
                projectName: project.name,
                targetUserIds: [memberId],
            },
        };
    },
    /** Adds/removes collections of the same workspace to/from the project. */
    async setCollection(userId, id, collectionId, attach) {
        const { project } = await assertCan(userId, id, 'canEdit');
        const collection = await prisma_1.prisma.collection.findUnique({ where: { id: collectionId } });
        if (!collection || collection.workspaceId !== project.workspaceId)
            throw (0, http_error_1.NotFound)('Collection not found');
        return prisma_1.prisma.collection.update({ where: { id: collectionId }, data: { projectId: attach ? id : null } });
    },
};
