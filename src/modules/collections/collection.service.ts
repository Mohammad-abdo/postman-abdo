import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { reorder } from '../../core/utils/object';
import { CollectionRenderOptions, renderCollection } from '../../shared/postman/collection.renderer';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { limitsService } from '../platform/limits.service';
import { transferService } from '../transfer/transfer.service';
import { assertCollectionAccess } from './collection.access';
import { CreateCollectionInput, UpdateCollectionInput } from './collection.schema';

const ordered = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

export const collectionService = {
  async create(userId: string, input: CreateCollectionInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    if (input.id) {
      const existing = await prisma.collection.findUnique({ where: { id: input.id } });
      if (existing) return existing;
    }
    await limitsService.assertCanCreateCollection(input.workspaceId);
    const count = await prisma.collection.count({ where: { workspaceId: input.workspaceId } });
    return prisma.collection.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        workspaceId: input.workspaceId,
        projectId: input.projectId || null,
        name: input.name,
        description: input.description || '',
        auth: { type: 'noauth' },
        variables: [],
        preRequestScript: '',
        testScript: '',
        sortOrder: count,
      },
    });
  },

  get: (userId: string, id: string) => assertCollectionAccess(userId, id),

  async update(userId: string, id: string, input: UpdateCollectionInput) {
    await assertCollectionAccess(userId, id);
    return prisma.collection.update({ where: { id }, data: input as Prisma.CollectionUpdateInput });
  },

  /** Deleting moves the collection to Trash, like Postman. */
  async moveToTrash(userId: string, id: string) {
    await assertCollectionAccess(userId, id);
    await prisma.collection.update({ where: { id }, data: { deletedAt: new Date() } });
  },

  async trash(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    return prisma.collection.findMany({ where: { workspaceId, deletedAt: { not: null } }, orderBy: { deletedAt: 'desc' } });
  },

  async restore(userId: string, id: string) {
    await assertCollectionAccess(userId, id);
    return prisma.collection.update({ where: { id }, data: { deletedAt: null } });
  },

  async destroy(userId: string, id: string) {
    await assertCollectionAccess(userId, id);
    await prisma.collection.delete({ where: { id } });
  },

  async setPosition(userId: string, id: string, index: number) {
    const collection = await assertCollectionAccess(userId, id);
    const siblings = await prisma.collection.findMany({
      where: { workspaceId: collection.workspaceId, deletedAt: null },
      orderBy: ordered,
      select: { id: true },
    });
    const ids = reorder(siblings.map((s) => s.id), id, index);
    await prisma.$transaction(ids.map((cid, i) => prisma.collection.update({ where: { id: cid }, data: { sortOrder: i } })));
  },

  async duplicate(userId: string, id: string) {
    const collection = await assertCollectionAccess(userId, id);
    const json = await this.toPostman(id);
    return transferService.importCollection(collection.workspaceId, json, `${collection.name} Copy`);
  },

  async export(userId: string, id: string) {
    const collection = await assertCollectionAccess(userId, id);
    return { name: collection.name, json: await this.toPostman(id) };
  },

  /** Loads a collection and renders it as Postman Collection v2.1 JSON. */
  async toPostman(id: string, opts: CollectionRenderOptions = {}) {
    const collection = await prisma.collection.findUniqueOrThrow({ where: { id } });
    const [folders, requests] = await Promise.all([
      prisma.folder.findMany({ where: { collectionId: id }, orderBy: ordered }),
      prisma.request.findMany({
        where: { collectionId: id },
        orderBy: ordered,
        include: { examples: { orderBy: { sortOrder: 'asc' } } },
      }),
    ]);
    return renderCollection(collection, folders, requests, opts);
  },
};
