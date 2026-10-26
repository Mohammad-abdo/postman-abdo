import { json, prisma } from '../../core/database/prisma';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { HeartbeatInput, HistoryEntryInput } from './sync.schema';

export const syncService = {
  /** Records that a device is alive and how many offline changes it still has to upload. */
  heartbeat(userId: string, input: HeartbeatInput) {
    const data = {
      platform: input.platform,
      appVersion: input.appVersion,
      pendingOps: input.pendingOps,
      lastSyncAt: input.lastSyncAt ? new Date(input.lastSyncAt) : undefined,
      lastSeenAt: new Date(),
    };
    return prisma.syncDevice.upsert({
      where: { id: input.deviceId },
      create: { id: input.deviceId, userId, ...data },
      update: { ...data, userId },
    });
  },

  devices(userId: string) {
    return prisma.syncDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' } });
  },

  /** Idempotent by id: replays of the same entry return the stored row. */
  async recordHistory(userId: string, input: HistoryEntryInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    const existing = await prisma.historyItem.findUnique({ where: { id: input.id } });
    if (existing) return existing;
    return prisma.historyItem.create({
      data: {
        id: input.id,
        workspaceId: input.workspaceId,
        userId,
        method: input.method.toUpperCase(),
        url: input.url,
        name: input.name || null,
        request: json(input.request),
        response: input.response ? json(input.response) : undefined,
        createdAt: input.createdAt ? new Date(input.createdAt) : undefined,
      },
    });
  },
};
