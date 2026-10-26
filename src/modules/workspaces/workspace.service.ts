import { prisma } from '../../core/database/prisma';
import { BadRequest, NotFound } from '../../core/errors/http-error';
import { limitsService } from '../platform/limits.service';
import { assertWorkspaceAdmin, assertWorkspaceMember } from './workspace.access';
import { AddMemberInput, CreateWorkspaceInput, UpdateWorkspaceInput } from './workspace.schema';

const memberUser = { select: { id: true, name: true, email: true } } as const;

export const workspaceService = {
  list(userId: string) {
    return prisma.workspace.findMany({
      where: { members: { some: { userId } } },
      orderBy: { createdAt: 'asc' },
      include: { members: { include: { user: memberUser } } },
    });
  },

  /** The workspace every new account gets (not counted against the limit check). */
  createPersonal(userId: string) {
    return this.insert(userId, { name: 'My Workspace', type: 'personal' });
  },

  async create(userId: string, input: CreateWorkspaceInput) {
    if (input.id) {
      const existing = await prisma.workspace.findUnique({ where: { id: input.id } });
      if (existing) return existing;
    }
    await limitsService.assertCanCreateWorkspace(userId);
    return this.insert(userId, input);
  },

  /** Every workspace starts with its Globals scope, like Postman. */
  insert(userId: string, input: CreateWorkspaceInput) {
    return prisma.workspace.create({
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

  async update(userId: string, id: string, input: UpdateWorkspaceInput) {
    await assertWorkspaceMember(userId, id);
    return prisma.workspace.update({ where: { id }, data: input });
  },

  async remove(userId: string, id: string) {
    await assertWorkspaceAdmin(userId, id);
    if ((await prisma.workspaceMember.count({ where: { userId } })) <= 1) {
      throw BadRequest('You cannot delete your only workspace');
    }
    await prisma.workspace.delete({ where: { id } });
  },

  async addMember(userId: string, id: string, input: AddMemberInput) {
    await assertWorkspaceMember(userId, id);
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw NotFound('No user with this email exists');
    const alreadyMember = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId: id, userId: user.id } } });
    if (!alreadyMember) await limitsService.assertCanAddMember(id);
    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: id, userId: user.id } },
      create: { workspaceId: id, userId: user.id, role: input.role },
      update: { role: input.role },
    });
    await prisma.workspace.update({ where: { id }, data: { type: 'team' } });
  },

  async removeMember(userId: string, id: string, memberId: string) {
    await assertWorkspaceAdmin(userId, id);
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: id, userId: memberId } });
  },

  /** Everything the sidebar needs in one round trip. */
  async tree(userId: string, id: string) {
    await assertWorkspaceMember(userId, id);
    const ordered = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];
    const collections = await prisma.collection.findMany({ where: { workspaceId: id, deletedAt: null }, orderBy: ordered });
    const collectionIds = collections.map((c) => c.id);
    const [folders, requests, examples] = await Promise.all([
      prisma.folder.findMany({ where: { collectionId: { in: collectionIds } }, orderBy: ordered }),
      prisma.request.findMany({ where: { collectionId: { in: collectionIds } }, orderBy: ordered }),
      prisma.example.findMany({
        where: { parent: { collectionId: { in: collectionIds } } },
        orderBy: ordered,
        select: { id: true, requestId: true, name: true, code: true, sortOrder: true },
      }),
    ]);
    return { collections, folders, requests, examples };
  },

  async search(userId: string, id: string, q: string) {
    await assertWorkspaceMember(userId, id);
    if (!q.trim()) return [];
    const inWorkspace = { workspaceId: id, deletedAt: null };
    const [collections, folders, requests, environments] = await Promise.all([
      prisma.collection.findMany({ where: { ...inWorkspace, name: { contains: q } }, take: 20 }),
      prisma.folder.findMany({ where: { collection: inWorkspace, name: { contains: q } }, take: 20 }),
      prisma.request.findMany({
        where: { collection: inWorkspace, OR: [{ name: { contains: q } }, { url: { contains: q } }] },
        take: 30,
      }),
      prisma.environment.findMany({ where: { workspaceId: id, name: { contains: q } }, take: 20 }),
    ]);
    return [
      ...collections.map((c) => ({ kind: 'collection', id: c.id, name: c.name })),
      ...folders.map((f) => ({ kind: 'folder', id: f.id, name: f.name, collectionId: f.collectionId })),
      ...requests.map((r) => ({ kind: 'request', id: r.id, name: r.name, method: r.method, url: r.url, collectionId: r.collectionId, type: r.type })),
      ...environments.map((e) => ({ kind: 'environment', id: e.id, name: e.name, isGlobal: e.isGlobal })),
    ];
  },
};
