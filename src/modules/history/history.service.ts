import { prisma, json } from '../../core/database/prisma';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

export interface HistoryEntryInput {
  workspaceId: string;
  userId: string;
  request: { method?: string; url?: string; name?: string } & Record<string, unknown>;
  response: Record<string, unknown> | null;
}

export const historyService = {
  async list(userId: string, workspaceId: string, limit = 300) {
    await assertWorkspaceMember(userId, workspaceId);
    return prisma.historyItem.findMany({ where: { workspaceId, userId }, orderBy: { createdAt: 'desc' }, take: limit });
  },

  /** Stores the request without its collection linkage, like Postman's history. */
  record({ workspaceId, userId, request, response }: HistoryEntryInput) {
    const { id: _id, collectionId: _c, folderId: _f, ...snapshot } = request;
    return prisma.historyItem.create({
      data: {
        workspaceId,
        userId,
        method: String(request.method || 'GET').toUpperCase(),
        url: String(request.url || ''),
        name: request.name || null,
        request: json(snapshot),
        response: response ? json(response) : undefined,
      },
    });
  },

  async clear(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    await prisma.historyItem.deleteMany({ where: { workspaceId, userId } });
  },

  async removeMany(userId: string, ids: string[]) {
    await prisma.historyItem.deleteMany({ where: { id: { in: ids }, userId } });
  },
};
