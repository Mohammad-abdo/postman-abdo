import { Prisma } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { BadRequest } from '../../core/errors/http-error';
import { reorder } from '../../core/utils/object';
import { findItem } from '../../shared/postman/collection.renderer';
import { assertCollectionAccess, assertFolderAccess } from '../collections/collection.access';
import { collectionService } from '../collections/collection.service';
import { transferService } from '../transfer/transfer.service';
import { CreateFolderInput, MoveFolderInput, UpdateFolderInput } from './folder.schema';

const ordered = [{ sortOrder: 'asc' as const }, { createdAt: 'asc' as const }];

async function subtreeIds(folderId: string): Promise<string[]> {
  const children = await prisma.folder.findMany({ where: { parentId: folderId }, select: { id: true } });
  const nested = await Promise.all(children.map((c) => subtreeIds(c.id)));
  return [folderId, ...nested.flat()];
}

export const folderService = {
  async create(userId: string, input: CreateFolderInput) {
    await assertCollectionAccess(userId, input.collectionId);
    if (input.id) {
      const existing = await prisma.folder.findUnique({ where: { id: input.id } });
      if (existing) return existing;
    }
    const parentId = input.parentId || null;
    if (parentId) await assertFolderAccess(userId, parentId);
    const count = await prisma.folder.count({ where: { collectionId: input.collectionId, parentId } });
    return prisma.folder.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        collectionId: input.collectionId,
        parentId,
        name: input.name,
        description: '',
        auth: { type: 'inherit' },
        preRequestScript: '',
        testScript: '',
        sortOrder: count,
      },
    });
  },

  get: (userId: string, id: string) => assertFolderAccess(userId, id),

  async update(userId: string, id: string, input: UpdateFolderInput) {
    await assertFolderAccess(userId, id);
    return prisma.folder.update({ where: { id }, data: input as Prisma.FolderUpdateInput });
  },

  async remove(userId: string, id: string) {
    await assertFolderAccess(userId, id);
    await prisma.folder.delete({ where: { id } });
  },

  /** Deep copy placed after the original's siblings. */
  async duplicate(userId: string, id: string) {
    const folder = await assertFolderAccess(userId, id);
    const json = await collectionService.toPostman(folder.collectionId);
    const item = findItem(json.item, folder.id);
    const position = await prisma.folder.count({ where: { collectionId: folder.collectionId, parentId: folder.parentId } });
    await transferService.importItems(folder.collectionId, folder.parentId, [{ ...item, name: `${folder.name} Copy` }], position);
  },

  /** Drag & drop: re-parent (possibly into another collection) and reorder. */
  async move(userId: string, id: string, input: MoveFolderInput) {
    const folder = await assertFolderAccess(userId, id);
    await assertCollectionAccess(userId, input.collectionId);
    const subtree = await subtreeIds(folder.id);
    if (input.parentId) {
      const target = await assertFolderAccess(userId, input.parentId);
      if (target.collectionId !== input.collectionId) throw BadRequest('Folder is not in that collection');
      if (subtree.includes(input.parentId)) throw BadRequest('Cannot move a folder into itself');
    }

    await prisma.folder.update({ where: { id }, data: { parentId: input.parentId, collectionId: input.collectionId } });
    if (folder.collectionId !== input.collectionId) {
      await prisma.folder.updateMany({ where: { id: { in: subtree } }, data: { collectionId: input.collectionId } });
      await prisma.request.updateMany({ where: { folderId: { in: subtree } }, data: { collectionId: input.collectionId } });
    }

    const siblings = await prisma.folder.findMany({
      where: { collectionId: input.collectionId, parentId: input.parentId },
      orderBy: ordered,
      select: { id: true },
    });
    const ids = reorder(siblings.map((s) => s.id), id, input.index);
    await prisma.$transaction(ids.map((fid, i) => prisma.folder.update({ where: { id: fid }, data: { sortOrder: i } })));
  },
};
