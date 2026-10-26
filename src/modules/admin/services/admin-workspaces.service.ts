import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prisma';
import { BadRequest, NotFound } from '../../../core/errors/http-error';
import { limitsService } from '../../platform/limits.service';
import { ListQuery, UpdateWorkspaceInput } from '../admin.schema';

const userBrief = { select: { id: true, name: true, email: true, avatarUrl: true } } as const;

async function findOrThrow(id: string) {
  const workspace = await prisma.workspace.findUnique({ where: { id } });
  if (!workspace) throw NotFound('Workspace not found');
  return workspace;
}

export const adminWorkspacesService = {
  async list(query: ListQuery) {
    const where: Prisma.WorkspaceWhereInput = query.q ? { OR: [{ name: { contains: query.q } }, { id: query.q }] } : {};
    const [total, workspaces] = await Promise.all([
      prisma.workspace.count({ where }),
      prisma.workspace.findMany({
        where,
        include: { _count: { select: { members: true, collections: true, projects: true, environments: true } } },
        orderBy: { createdAt: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const owners = await prisma.user.findMany({ where: { id: { in: workspaces.map((w) => w.ownerId) } }, ...userBrief });
    const ownerById = new Map(owners.map((o) => [o.id, o]));
    const items = await Promise.all(
      workspaces.map(async ({ _count, ...w }) => ({
        ...w,
        owner: ownerById.get(w.ownerId) || null,
        effectiveMemberLimit: await limitsService.memberLimit(w.id),
        ..._count,
      })),
    );
    return { total, page: query.page, pageSize: query.pageSize, items };
  },

  async detail(id: string) {
    const workspace = await prisma.workspace.findUnique({
      where: { id },
      include: {
        members: { include: { user: userBrief } },
        projects: { include: { _count: { select: { members: true, collections: true, environments: true } } } },
        collections: { where: { deletedAt: null }, select: { id: true, name: true, projectId: true, createdAt: true, _count: { select: { requests: true, folders: true } } } },
        _count: { select: { environments: true, mocks: true, monitors: true, history: true } },
      },
    });
    if (!workspace) throw NotFound('Workspace not found');
    const owner = await prisma.user.findUnique({ where: { id: workspace.ownerId }, ...userBrief });
    return { ...workspace, owner, effectiveMemberLimit: await limitsService.memberLimit(id) };
  },

  async update(id: string, input: UpdateWorkspaceInput) {
    await findOrThrow(id);
    return prisma.workspace.update({ where: { id }, data: input });
  },

  async removeMember(id: string, userId: string) {
    const workspace = await findOrThrow(id);
    if (workspace.ownerId === userId) throw BadRequest('Transfer ownership before removing the owner');
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId } });
    await prisma.projectMember.deleteMany({ where: { userId, project: { workspaceId: id } } });
  },

  async transferOwnership(id: string, userId: string) {
    await findOrThrow(id);
    const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId } } });
    if (!member) throw BadRequest('The new owner must be a member of the workspace');
    await prisma.$transaction([
      prisma.workspace.update({ where: { id }, data: { ownerId: userId } }),
      prisma.workspaceMember.update({ where: { id: member.id }, data: { role: 'admin' } }),
    ]);
  },

  async remove(id: string) {
    await findOrThrow(id);
    await prisma.workspace.delete({ where: { id } });
  },
};
