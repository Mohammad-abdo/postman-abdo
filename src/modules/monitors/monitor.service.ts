import { prisma, json } from '../../core/database/prisma';
import { NotFound } from '../../core/errors/http-error';
import { assertCollectionAccess } from '../collections/collection.access';
import { collectionService } from '../collections/collection.service';
import { runCollection } from '../execution/runtime/runtime.adapter';
import { stripBody } from '../execution/runtime/serializers';
import { loadScopes, runtimeValues } from '../execution/variable-scopes';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { CreateMonitorInput, UpdateMonitorInput } from './monitor.schema';
import { MonitorScheduler } from './monitor.scheduler';

async function assertMonitorAccess(userId: string, id: string) {
  const monitor = await prisma.monitor.findUnique({ where: { id } });
  if (!monitor) throw NotFound('Monitor not found');
  await assertWorkspaceMember(userId, monitor.workspaceId);
  return monitor;
}

/**
 * Monitors run like Postman's cloud monitors: no local cookie jar and variable changes are not persisted.
 */
async function execute(monitorId: string) {
  const monitor = await prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
  const result = await runCollection({
    collection: await collectionService.toPostman(monitor.collectionId, { forRun: true, useCurrentValues: true }),
    ...runtimeValues(await loadScopes(monitor.workspaceId, monitor.environmentId)),
  });
  await prisma.monitor.update({ where: { id: monitorId }, data: { lastRunAt: new Date() } });
  return prisma.collectionRun.create({
    data: {
      workspaceId: monitor.workspaceId,
      collectionId: monitor.collectionId,
      monitorId,
      source: 'monitor',
      name: monitor.name,
      stats: json({ ...result.stats, error: result.error }),
      results: json(result.executions.map((e) => ({ ...stripBody(e), visualizer: null }))),
    },
  });
}

const scheduler = new MonitorScheduler(execute);

export const monitorService = {
  async startAll() {
    (await prisma.monitor.findMany()).forEach((m) => scheduler.schedule(m));
  },

  async list(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    return prisma.monitor.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
  },

  async create(userId: string, input: CreateMonitorInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    await assertCollectionAccess(userId, input.collectionId);
    const monitor = await prisma.monitor.create({ data: { ...input, environmentId: input.environmentId || null } });
    scheduler.schedule(monitor);
    return monitor;
  },

  async update(userId: string, id: string, input: UpdateMonitorInput) {
    await assertMonitorAccess(userId, id);
    const monitor = await prisma.monitor.update({ where: { id }, data: input });
    scheduler.schedule(monitor);
    return monitor;
  },

  async remove(userId: string, id: string) {
    await assertMonitorAccess(userId, id);
    scheduler.unschedule(id);
    await prisma.monitor.delete({ where: { id } });
  },

  async runNow(userId: string, id: string) {
    await assertMonitorAccess(userId, id);
    return execute(id);
  },

  async runs(userId: string, id: string) {
    await assertMonitorAccess(userId, id);
    return prisma.collectionRun.findMany({ where: { monitorId: id }, orderBy: { createdAt: 'desc' }, take: 100 });
  },
};
