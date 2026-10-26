import { json, prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden, NotFound } from '../../core/errors/http-error';
import { limitsService } from '../platform/limits.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { WithEvent } from '../workspaces/workspace.events';
import { AddProjectMembersInput, CreateProjectInput, UpdateProjectInput } from './project.schema';

const memberUser = { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } } as const;

/** The three environments every project starts with. */
const STAGES = [
  { stage: 'local', name: 'Local', defaultUrl: 'http://localhost:3000' },
  { stage: 'development', name: 'Development', defaultUrl: 'https://dev.example.com' },
  { stage: 'production', name: 'Production', defaultUrl: 'https://api.example.com' },
] as const;

const baseUrlVariable = (value: string) => [{ key: 'baseUrl', value, currentValue: '', type: 'default', enabled: true, description: 'Root URL of the API' }];

/** Variables for one stage: the guided setup's exact list, or the default `baseUrl`. */
function stageVariables(input: CreateProjectInput, stage: (typeof STAGES)[number]) {
  const custom = input.environments?.find((e) => e.stage === stage.stage);
  if (!custom) return baseUrlVariable(input.baseUrls[stage.stage] || stage.defaultUrl);
  return custom.variables.map((v) => ({ key: v.key, value: v.value, currentValue: '', type: v.type, enabled: true, description: '' }));
}

/**
 * Project permissions, derived from the workspace role and the project role:
 * - see:    workspace admins/editors see every project; others only projects they belong to
 * - invite: workspace admins/editors (any project), project admins — viewers never
 * - edit:   workspace admins, project admins/editors (collections, environments)
 * - manage: workspace admins, project admins (details, member roles/removal, delete)
 */
async function projectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw NotFound('Project not found');
  const workspaceRole = (await assertWorkspaceMember(userId, project.workspaceId)).role;
  const projectRole = (await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } }))?.role || null;

  const workspaceWide = workspaceRole === 'admin' || workspaceRole === 'editor';
  if (!workspaceWide && !projectRole) throw NotFound('Project not found');
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

async function assertCan(userId: string, projectId: string, ability: 'canManage' | 'canEdit' | 'canInvite') {
  const access = await projectAccess(userId, projectId);
  if (!access[ability]) throw Forbidden(ability === 'canInvite' ? 'Your workspace role cannot invite people to projects' : 'Only project admins can do this');
  return access;
}

async function workspaceMemberIds(workspaceId: string) {
  return (await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } })).map((m) => m.userId);
}

async function assertWorkspaceUsers(workspaceId: string, userIds: string[]) {
  const members = new Set(await workspaceMemberIds(workspaceId));
  if (userIds.some((id) => !members.has(id))) {
    throw BadRequest('Only members of this workspace can be added to the project. Invite them to the workspace first.');
  }
}

const memberIdsOf = async (projectId: string) =>
  (await prisma.projectMember.findMany({ where: { projectId }, select: { userId: true } })).map((m) => m.userId);

export const projectService = {
  /** Projects of a workspace the user can see. */
  async list(userId: string, workspaceId: string) {
    const member = await assertWorkspaceMember(userId, workspaceId);
    const seesAll = member.role === 'admin' || member.role === 'editor';
    return prisma.project.findMany({
      where: { workspaceId, ...(seesAll ? {} : { members: { some: { userId } } }) },
      orderBy: { createdAt: 'asc' },
      include: {
        members: { include: { user: memberUser } },
        _count: { select: { collections: true, environments: true } },
      },
    });
  },

  async get(userId: string, id: string) {
    const { canManage, canEdit, canInvite, projectRole } = await projectAccess(userId, id);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        members: { include: { user: memberUser } },
        collections: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, updatedAt: true } },
        environments: { orderBy: { createdAt: 'asc' } },
      },
    });
    return { ...project, canManage, canEdit, canInvite, myRole: projectRole };
  },

  async create(userId: string, input: CreateProjectInput): Promise<WithEvent<unknown>> {
    const member = await assertWorkspaceMember(userId, input.workspaceId);
    if (member.role === 'viewer') throw Forbidden('Viewers cannot create projects');
    if (input.id) {
      const existing = await prisma.project.findUnique({ where: { id: input.id } });
      if (existing) return { result: await this.get(userId, existing.id), event: null };
    }
    await limitsService.assertCanCreateProject(input.workspaceId);
    const invited = input.addAllMembers ? await workspaceMemberIds(input.workspaceId) : input.memberIds;
    const others = [...new Set(invited)].filter((m) => m !== userId);
    await assertWorkspaceUsers(input.workspaceId, others);

    const project = await prisma.$transaction(async (tx) => {
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
            variables: json(stageVariables(input, s)),
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

  async update(userId: string, id: string, input: UpdateProjectInput) {
    await assertCan(userId, id, 'canManage');
    return prisma.project.update({ where: { id }, data: input });
  },

  /** Collections are kept (moved out of the project); the project's environments are removed with it. */
  async remove(userId: string, id: string): Promise<WithEvent<{ ok: true }>> {
    const { project } = await assertCan(userId, id, 'canManage');
    const members = (await memberIdsOf(id)).filter((m) => m !== userId);
    await prisma.$transaction([
      prisma.collection.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      prisma.project.delete({ where: { id } }),
    ]);
    return {
      result: { ok: true },
      event: { type: 'project.deleted', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: members },
    };
  },

  async members(userId: string, id: string) {
    await projectAccess(userId, id);
    return prisma.projectMember.findMany({ where: { projectId: id }, include: { user: memberUser } });
  },

  /**
   * Adds workspace members to a project: specific people (`userIds`) or the whole team (`all`).
   * Existing members keep their role. Returns who was actually added.
   */
  async addMembers(userId: string, id: string, input: AddProjectMembersInput): Promise<WithEvent<{ added: string[] }>> {
    const { project } = await assertCan(userId, id, 'canInvite');
    const candidates = input.all ? await workspaceMemberIds(project.workspaceId) : [...new Set(input.userIds)];
    await assertWorkspaceUsers(project.workspaceId, candidates);
    const existing = new Set(await memberIdsOf(id));
    const added = candidates.filter((m) => !existing.has(m));
    if (added.length) {
      await prisma.projectMember.createMany({ data: added.map((m) => ({ projectId: id, userId: m, role: input.role })), skipDuplicates: true });
    }
    return {
      result: { added },
      event: added.length
        ? { type: 'project.member_added', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: added, role: input.role }
        : null,
    };
  },

  async updateMember(userId: string, id: string, memberId: string, role: string): Promise<WithEvent<unknown>> {
    const { project } = await assertCan(userId, id, 'canManage');
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
    if (!member) throw NotFound('Member not found');
    if (member.role === 'admin' && role !== 'admin') {
      const otherAdmins = await prisma.projectMember.count({ where: { projectId: id, role: 'admin', userId: { not: memberId } } });
      if (!otherAdmins) throw BadRequest('A project needs at least one admin');
    }
    const updated = await prisma.projectMember.update({ where: { id: member.id }, data: { role } });
    return {
      result: updated,
      event: { type: 'project.member_role_changed', actorId: userId, workspaceId: project.workspaceId, projectId: id, projectName: project.name, targetUserIds: [memberId], role },
    };
  },

  /** Managers remove anyone; members can leave. A project always keeps at least one admin. */
  async removeMember(userId: string, id: string, memberId: string): Promise<WithEvent<{ ok: true }>> {
    const { project } = memberId === userId ? await projectAccess(userId, id) : await assertCan(userId, id, 'canManage');
    const target = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
    if (!target) throw NotFound('Member not found');
    const otherAdmins = await prisma.projectMember.count({ where: { projectId: id, role: 'admin', userId: { not: memberId } } });
    if (target.role === 'admin' && otherAdmins === 0) throw BadRequest('A project needs at least one admin');
    await prisma.projectMember.delete({ where: { id: target.id } });
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
  async setCollection(userId: string, id: string, collectionId: string, attach: boolean) {
    const { project } = await assertCan(userId, id, 'canEdit');
    const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection || collection.workspaceId !== project.workspaceId) throw NotFound('Collection not found');
    return prisma.collection.update({ where: { id: collectionId }, data: { projectId: attach ? id : null } });
  },
};
