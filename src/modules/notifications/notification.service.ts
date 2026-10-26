import { Notification } from '@prisma/client';
import { json, prisma } from '../../core/database/prisma';
import { NotFound } from '../../core/errors/http-error';
import { realtime } from '../realtime/realtime.hub';
import { NotifyInput, categoryOf } from './notification.types';

const PAGE_SIZE = 30;

const view = (n: Notification) => ({ ...n, category: categoryOf(n.type) });

async function unreadCount(userId: string) {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

async function pushTo(userId: string, notification: Notification) {
  realtime.emit(userId, 'notification.new', { notification: view(notification), unread: await unreadCount(userId) });
}

export const notificationService = {
  /** Creates (or coalesces) one notification per recipient and pushes it instantly over the socket. */
  async notify(recipientIds: string[], input: NotifyInput) {
    const recipients = [...new Set(recipientIds)].filter((id) => id && id !== input.actor?.id);
    for (const userId of recipients) {
      const since = new Date(Date.now() - (input.coalesceMinutes ?? 0) * 60_000);
      const linkId = input.link?.id ?? null;
      const existing = input.coalesceMinutes
        ? await prisma.notification.findFirst({
            where: { userId, type: input.type, actorId: input.actor?.id ?? null, readAt: null, updatedAt: { gte: since } },
            orderBy: { updatedAt: 'desc' },
          })
        : null;
      const sameTarget = existing && ((existing.link as { id?: string } | null)?.id ?? null) === linkId;

      const notification = sameTarget
        ? await prisma.notification.update({ where: { id: existing!.id }, data: { count: { increment: 1 }, title: input.title, body: input.body } })
        : await prisma.notification.create({
            data: {
              userId,
              type: input.type,
              title: input.title,
              body: input.body,
              workspaceId: input.workspaceId ?? null,
              projectId: input.projectId ?? null,
              actorId: input.actor?.id ?? null,
              actorName: input.actor?.name ?? null,
              link: input.link ? json(input.link) : undefined,
            },
          });
      await pushTo(userId, notification);
    }
  },

  /**
   * Team activity: the workspace owner hears about everything members do; `alsoNotify` adds direct recipients
   * (e.g. the person who was invited).
   */
  async workspaceEvent(workspaceId: string, input: Omit<NotifyInput, 'workspaceId'>, alsoNotify: string[] = []) {
    const workspace = await prisma.workspace.findUnique({ where: { id: workspaceId }, select: { ownerId: true, name: true } });
    if (!workspace) return;
    await this.notify([workspace.ownerId, ...alsoNotify], { coalesceMinutes: 15, ...input, workspaceId });
  },

  async list(userId: string, { cursor, unreadOnly }: { cursor?: string; unreadOnly?: boolean }) {
    const items = await prisma.notification.findMany({
      where: { userId, ...(unreadOnly ? { readAt: null } : {}), ...(cursor ? { updatedAt: { lt: new Date(cursor) } } : {}) },
      orderBy: { updatedAt: 'desc' },
      take: PAGE_SIZE,
    });
    return {
      items: items.map(view),
      unread: await unreadCount(userId),
      nextCursor: items.length === PAGE_SIZE ? items[items.length - 1].updatedAt.toISOString() : null,
    };
  },

  unreadCount,

  async markRead(userId: string, ids?: string[]) {
    await prisma.notification.updateMany({ where: { userId, readAt: null, ...(ids?.length ? { id: { in: ids } } : {}) }, data: { readAt: new Date() } });
    const unread = await unreadCount(userId);
    realtime.emit(userId, 'notification.read', { ids: ids || 'all', unread });
    return { unread };
  },

  async remove(userId: string, id: string) {
    const deleted = await prisma.notification.deleteMany({ where: { id, userId } });
    if (!deleted.count) throw NotFound('Notification not found');
    return { unread: await unreadCount(userId) };
  },

  async clear(userId: string) {
    await prisma.notification.deleteMany({ where: { userId } });
    return { unread: 0 };
  },
};
