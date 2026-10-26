import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { BadRequest } from '../../core/errors/http-error';
import { reorder } from '../../core/utils/object';
import { emptyBody } from '../../shared/postman/types';
import { assertCollectionAccess, assertFolderAccess, assertRequestAccess } from '../collections/collection.access';
import { CreateRequestInput, MoveRequestInput, UpdateRequestInput } from './request.schema';

const ordered = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

const defaults = () => ({
  type: 'http',
  name: 'New Request',
  method: 'GET',
  url: '',
  params: [],
  pathVariables: [],
  headers: [],
  body: emptyBody(),
  auth: { type: 'inherit' },
  preRequestScript: '',
  testScript: '',
  settings: {},
  description: '',
});

export const requestService = {
  async create(userId: string, input: CreateRequestInput) {
    const { collectionId, folderId, id, ...fields } = input;
    await assertCollectionAccess(userId, collectionId);
    if (id) {
      const existing = await prisma.request.findUnique({ where: { id } });
      if (existing) return existing;
    }
    if (folderId) await assertFolderAccess(userId, folderId);
    const count = await prisma.request.count({ where: { collectionId, folderId: folderId || null } });
    return prisma.request.create({
      data: { ...defaults(), ...fields, ...(id ? { id } : {}), collectionId, folderId: folderId || null, sortOrder: count } as Prisma.RequestUncheckedCreateInput,
    });
  },

  async get(userId: string, id: string) {
    await assertRequestAccess(userId, id);
    return prisma.request.findUnique({ where: { id }, include: { examples: { orderBy: { sortOrder: 'asc' } } } });
  },

  async update(userId: string, id: string, input: UpdateRequestInput) {
    await assertRequestAccess(userId, id);
    return prisma.request.update({ where: { id }, data: input as Prisma.RequestUpdateInput });
  },

  async remove(userId: string, id: string) {
    await assertRequestAccess(userId, id);
    await prisma.request.delete({ where: { id } });
  },

  /** Copies the request (and its examples) right below the original. */
  async duplicate(userId: string, id: string) {
    const original = await assertRequestAccess(userId, id);
    const { id: _id, createdAt: _c, updatedAt: _u, ...fields } = original;
    return prisma.$transaction(async (tx) => {
      await tx.request.updateMany({
        where: { collectionId: original.collectionId, folderId: original.folderId, sortOrder: { gt: original.sortOrder } },
        data: { sortOrder: { increment: 1 } },
      });
      const copy = await tx.request.create({
        data: { ...fields, name: `${original.name} Copy`, sortOrder: original.sortOrder + 1 } as Prisma.RequestUncheckedCreateInput,
      });
      const examples = await tx.example.findMany({ where: { requestId: id } });
      for (const { id: _eid, requestId: _rid, createdAt: _ec, updatedAt: _eu, ...example } of examples) {
        await tx.example.create({ data: { ...example, requestId: copy.id } as Prisma.ExampleUncheckedCreateInput });
      }
      return copy;
    });
  },

  async move(userId: string, id: string, input: MoveRequestInput) {
    await assertRequestAccess(userId, id);
    await assertCollectionAccess(userId, input.collectionId);
    if (input.folderId) {
      const folder = await assertFolderAccess(userId, input.folderId);
      if (folder.collectionId !== input.collectionId) throw BadRequest('Folder is not in that collection');
    }
    await prisma.request.update({ where: { id }, data: { collectionId: input.collectionId, folderId: input.folderId } });
    const siblings = await prisma.request.findMany({
      where: { collectionId: input.collectionId, folderId: input.folderId },
      orderBy: ordered,
      select: { id: true },
    });
    const ids = reorder(siblings.map((s) => s.id), id, input.index);
    await prisma.$transaction(ids.map((rid, i) => prisma.request.update({ where: { id: rid }, data: { sortOrder: i } })));
  },
};
