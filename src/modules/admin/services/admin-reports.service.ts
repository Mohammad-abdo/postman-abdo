import { cache, cacheKeys } from '../../../core/cache/cache.service';
import { prisma } from '../../../core/database/prisma';

const DAY = 86_400_000;

const startOfUtcDay = (d = new Date()) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/** Every day between `from` and today, so charts have no gaps. */
function dayRange(days: number) {
  const today = startOfUtcDay();
  return Array.from({ length: days }, (_, i) => isoDay(new Date(today.getTime() - (days - 1 - i) * DAY)));
}

async function usageSeries(days: number) {
  const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY);
  const rows = await prisma.usageDaily.groupBy({
    by: ['date'],
    where: { date: { gte: from } },
    _sum: { requests: true, runs: true, errors: true },
  });
  const byDay = new Map(rows.map((r) => [isoDay(r.date), r._sum]));
  return dayRange(days).map((date) => ({
    date,
    requests: byDay.get(date)?.requests || 0,
    runs: byDay.get(date)?.runs || 0,
    errors: byDay.get(date)?.errors || 0,
  }));
}

async function signupSeries(days: number) {
  const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY);
  const users = await prisma.user.findMany({ where: { createdAt: { gte: from } }, select: { createdAt: true } });
  const counts = new Map<string, number>();
  users.forEach((u) => counts.set(isoDay(u.createdAt), (counts.get(isoDay(u.createdAt)) || 0) + 1));
  return dayRange(days).map((date) => ({ date, signups: counts.get(date) || 0 }));
}

export const adminReportsService = {
  /** Dashboard home numbers (cached for a minute). */
  overview() {
    return cache.wrap(cacheKeys.adminOverview(), 60, async () => {
      const now = Date.now();
      const today = startOfUtcDay();
      const [
        users,
        suspended,
        staff,
        activeToday,
        active7d,
        newThisWeek,
        workspaces,
        projects,
        collections,
        requests,
        environments,
        storage,
        pendingDevices,
        todayUsage,
        series,
        signups,
      ] = await Promise.all([
        prisma.user.count(),
        prisma.user.count({ where: { status: 'suspended' } }),
        prisma.user.count({ where: { role: { in: ['staff', 'admin'] } } }),
        prisma.user.count({ where: { lastSeenAt: { gte: today } } }),
        prisma.user.count({ where: { lastSeenAt: { gte: new Date(now - 7 * DAY) } } }),
        prisma.user.count({ where: { createdAt: { gte: new Date(now - 7 * DAY) } } }),
        prisma.workspace.count(),
        prisma.project.count(),
        prisma.collection.count({ where: { deletedAt: null } }),
        prisma.request.count(),
        prisma.environment.count({ where: { isGlobal: false } }),
        prisma.uploadedFile.aggregate({ _sum: { size: true }, _count: true }),
        prisma.syncDevice.count({ where: { pendingOps: { gt: 0 } } }),
        prisma.usageDaily.aggregate({ where: { date: today }, _sum: { requests: true, runs: true, errors: true } }),
        usageSeries(30),
        signupSeries(30),
      ]);
      const total30 = series.reduce((n, d) => n + d.requests, 0);
      const prev7 = series.slice(-14, -7).reduce((n, d) => n + d.requests, 0);
      const last7 = series.slice(-7).reduce((n, d) => n + d.requests, 0);
      return {
        users: { total: users, suspended, staff, activeToday, active7d, newThisWeek },
        content: { workspaces, projects, collections, requests, environments },
        storage: { bytes: storage._sum.size || 0, files: storage._count },
        sync: { devicesWithPendingChanges: pendingDevices },
        executions: {
          today: todayUsage._sum.requests || 0,
          runsToday: todayUsage._sum.runs || 0,
          errorsToday: todayUsage._sum.errors || 0,
          last30Days: total30,
          weekOverWeek: prev7 ? Math.round(((last7 - prev7) / prev7) * 100) : null,
        },
        series: series.map((d, i) => ({ ...d, signups: signups[i].signups })),
      };
    });
  },

  async reports(days: number) {
    const from = new Date(startOfUtcDay().getTime() - (days - 1) * DAY);
    const [usage, signups, topUsage, devices, workspaces] = await Promise.all([
      usageSeries(days),
      signupSeries(days),
      prisma.usageDaily.groupBy({
        by: ['userId'],
        where: { date: { gte: from } },
        _sum: { requests: true, runs: true, errors: true },
        orderBy: { _sum: { requests: 'desc' } },
        take: 10,
      }),
      prisma.syncDevice.groupBy({ by: ['platform'], _count: true }),
      prisma.workspace.findMany({
        select: { id: true, name: true, ownerId: true, _count: { select: { members: true, collections: true, projects: true } } },
        orderBy: { collections: { _count: 'desc' } },
        take: 10,
      }),
    ]);
    const users = await prisma.user.findMany({
      where: { id: { in: [...topUsage.map((u) => u.userId), ...workspaces.map((w) => w.ownerId)] } },
      select: { id: true, name: true, email: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));
    return {
      days,
      daily: usage.map((d, i) => ({ ...d, signups: signups[i].signups })),
      topUsers: topUsage.map((u) => ({ user: userById.get(u.userId) || { id: u.userId }, ...u._sum })),
      topWorkspaces: workspaces.map((w) => ({
        id: w.id,
        name: w.name,
        owner: userById.get(w.ownerId) || null,
        members: w._count.members,
        collections: w._count.collections,
        projects: w._count.projects,
      })),
      platforms: devices.map((d) => ({ platform: d.platform, devices: d._count })),
    };
  },
};
