import { prisma } from '../../core/database/prisma';
import { NotFound } from '../../core/errors/http-error';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

/** Ownership guards for everything that lives inside a collection. */

export async function assertCollectionAccess(userId: string, collectionId: string) {
  const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
  if (!collection) throw NotFound('Collection not found');
  await assertWorkspaceMember(userId, collection.workspaceId);
  return collection;
}

export async function assertFolderAccess(userId: string, folderId: string) {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } });
  if (!folder) throw NotFound('Folder not found');
  await assertCollectionAccess(userId, folder.collectionId);
  return folder;
}

export async function assertRequestAccess(userId: string, requestId: string) {
  const request = await prisma.request.findUnique({ where: { id: requestId } });
  if (!request) throw NotFound('Request not found');
  await assertCollectionAccess(userId, request.collectionId);
  return request;
}

export async function assertExampleAccess(userId: string, exampleId: string) {
  const example = await prisma.example.findUnique({ where: { id: exampleId } });
  if (!example) throw NotFound('Example not found');
  await assertRequestAccess(userId, example.requestId);
  return example;
}
