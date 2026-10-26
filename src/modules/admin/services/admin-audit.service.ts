import { Prisma } from '@prisma/client';
import { prisma } from '../../../core/database/prisma';
import { AuditQuery } from '../admin.schema';

export const adminAuditService = {
  async list(query: AuditQuery) {
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action ? { action: { startsWith: query.action } } : {}),
      ...(query.actorId ? { actorId: query.actorId } : {}),
      ...(query.targetType ? { targetType: query.targetType } : {}),
      ...(query.targetId ? { targetId: query.targetId } : {}),
      ...(query.q ? { OR: [{ actorEmail: { contains: query.q } }, { action: { contains: query.q } }, { targetId: query.q }] } : {}),
    };
    const [total, items, actions] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
      prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
    ]);
    return { total, page: query.page, pageSize: query.pageSize, items, actions: actions.map((a) => a.action) };
  },
};
