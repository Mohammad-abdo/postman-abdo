import { json, prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden, NotFound } from '../../core/errors/http-error';
import { limitsService } from '../platform/limits.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { AddProjectMemberInput, CreateProjectInput, UpdateProjectInput } from './project.schema';

const memberUser = { select: { id: true, name: true, email: true, avatarUrl: true, jobTitle: true } } as const;

/** The three environments every project starts with. */
const STAGES = [
  { stage: 'local', name: 'Local', defaultUrl: 'http://localhost:3000' },
  { stage: 'development', name: 'Development', defaultUrl: 'https://dev.example.com' },
  { stage: 'production', name: 'Production', defaultUrl: 'https://api.example.com' },
] as const;

const baseUrlVariable = (value: string) => [{ key: 'baseUrl', value, currentValue: '', type: 'default', enabled: true, description: 'Root URL of the API' }];

/**
 * Who can do what in a project:
 * - workspace admins and project admins manage the project and its members;
 * - project members (any role) can see it.
 */
async function projectAccess(userId: string, projectId: string) {
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  if (!project) throw NotFound('Project not found');
  const workspaceMember = await assertWorkspaceMember(userId, project.workspaceId);
  const projectMember = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId, userId } } });
  const canManage = workspaceMember.role === 'admin' || projectMember?.role === 'admin';
  if (!canManage && !projectMember) throw NotFound('Project not found');
  return { project, canManage, projectRole: projectMember?.role || (workspaceMember.role === 'admin' ? 'admin' : null) };
}

async function assertCanManage(userId: string, projectId: string) {
  const access = await projectAccess(userId, projectId);
  if (!access.canManage) throw Forbidden('Only project admins can do this');
  return access;
}

async function assertWorkspaceUser(workspaceId: string, userId: string) {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw BadRequest('Only members of this workspace can be added to the project. Invite them to the workspace first.');
}

export const projectService = {
  /** Projects of a workspace the user can see (all of them for workspace admins). */
  async list(userId: string, workspaceId: string) {
    const member = await assertWorkspaceMember(userId, workspaceId);
    return prisma.project.findMany({
      where: { workspaceId, ...(member.role === 'admin' ? {} : { members: { some: { userId } } }) },
      orderBy: { createdAt: 'asc' },
      include: {
        members: { include: { user: memberUser } },
        _count: { select: { collections: true, environments: true } },
      },
    });
  },

  async get(userId: string, id: string) {
    const { canManage, projectRole } = await projectAccess(userId, id);
    const project = await prisma.project.findUniqueOrThrow({
      where: { id },
      include: {
        members: { include: { user: memberUser } },
        collections: { where: { deletedAt: null }, orderBy: { sortOrder: 'asc' }, select: { id: true, name: true, description: true, updatedAt: true } },
        environments: { orderBy: { createdAt: 'asc' } },
      },
    });
    return { ...project, canManage, myRole: projectRole };
  },

  async create(userId: string, input: CreateProjectInput) {
    const member = await assertWorkspaceMember(userId, input.workspaceId);
    if (member.role === 'viewer') throw Forbidden('Viewers cannot create projects');
    if (input.id) {
      const existing = await prisma.project.findUnique({ where: { id: input.id } });
      if (existing) return existing;
    }
    await limitsService.assertCanCreateProject(input.workspaceId);
    for (const memberId of input.memberIds) await assertWorkspaceUser(input.workspaceId, memberId);

    const project = await prisma.$transaction(async (tx) => {
      const created = await tx.project.create({
        data: {
          ...(input.id ? { id: input.id } : {}),
          workspaceId: input.workspaceId,
          name: input.name,
          description: input.description || '',
          color: input.color,
          createdById: userId,
          members: {
            create: [{ userId, role: 'admin' }, ...input.memberIds.filter((m) => m !== userId).map((m) => ({ userId: m, role: 'editor' }))],
          },
        },
      });
      for (const s of STAGES) {
        await tx.environment.create({
          data: {
            workspaceId: input.workspaceId,
            projectId: created.id,
            stage: s.stage,
            name: `${input.name} · ${s.name}`,
            variables: json(baseUrlVariable(input.baseUrls[s.stage] || s.defaultUrl)),
          },
        });
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
    return this.get(userId, project.id);
  },

  async update(userId: string, id: string, input: UpdateProjectInput) {
    await assertCanManage(userId, id);
    return prisma.project.update({ where: { id }, data: input });
  },

  /** Collections are kept (moved out of the project); the project's environments are removed with it. */
  async remove(userId: string, id: string) {
    await assertCanManage(userId, id);
    await prisma.$transaction([
      prisma.collection.updateMany({ where: { projectId: id }, data: { projectId: null } }),
      prisma.project.delete({ where: { id } }),
    ]);
  },

  async members(userId: string, id: string) {
    await projectAccess(userId, id);
    return prisma.projectMember.findMany({ where: { projectId: id }, include: { user: memberUser } });
  },

  async addMember(userId: string, id: string, input: AddProjectMemberInput) {
    const { project } = await assertCanManage(userId, id);
    await assertWorkspaceUser(project.workspaceId, input.userId);
    return prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: id, userId: input.userId } },
      create: { projectId: id, userId: input.userId, role: input.role },
      update: { role: input.role },
    });
  },

  async updateMember(userId: string, id: string, memberId: string, role: string) {
    await assertCanManage(userId, id);
    const member = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
    if (!member) throw NotFound('Member not found');
    return prisma.projectMember.update({ where: { id: member.id }, data: { role } });
  },

  /** Admins remove anyone; members can leave. A project always keeps at least one admin. */
  async removeMember(userId: string, id: string, memberId: string) {
    if (memberId === userId) await projectAccess(userId, id);
    else await assertCanManage(userId, id);
    const admins = await prisma.projectMember.count({ where: { projectId: id, role: 'admin', userId: { not: memberId } } });
    const target = await prisma.projectMember.findUnique({ where: { projectId_userId: { projectId: id, userId: memberId } } });
    if (target?.role === 'admin' && admins === 0) throw BadRequest('A project needs at least one admin');
    await prisma.projectMember.deleteMany({ where: { projectId: id, userId: memberId } });
  },

  /** Adds/removes collections of the same workspace to/from the project. */
  async setCollection(userId: string, id: string, collectionId: string, attach: boolean) {
    const { project } = await assertCanManage(userId, id);
    const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection || collection.workspaceId !== project.workspaceId) throw NotFound('Collection not found');
    return prisma.collection.update({ where: { id: collectionId }, data: { projectId: attach ? id : null } });
  },
};
