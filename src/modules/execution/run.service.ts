import { prisma } from '../../core/database/prisma';
import { NotFound } from '../../core/errors/http-error';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

/** Stored results of collection runs (runner and monitors). */
export const runService = {
  async list(userId: string, workspaceId: string, collectionId?: string) {
    await assertWorkspaceMember(userId, workspaceId);
    return prisma.collectionRun.findMany({
      where: { workspaceId, ...(collectionId ? { collectionId } : {}) },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: { id: true, name: true, source: true, stats: true, createdAt: true, collectionId: true, monitorId: true },
    });
  },

  async get(userId: string, id: string) {
    const run = await prisma.collectionRun.findUnique({ where: { id } });
    if (!run) throw NotFound('Run not found');
    await assertWorkspaceMember(userId, run.workspaceId);
    return run;
  },

  async remove(userId: string, id: string) {
    await this.get(userId, id);
    await prisma.collectionRun.delete({ where: { id } });
  },
};
