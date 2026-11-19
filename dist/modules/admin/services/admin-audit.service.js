"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminAuditService = void 0;
const prisma_1 = require("../../../core/database/prisma");
exports.adminAuditService = {
    async list(query) {
        const where = {
            ...(query.action ? { action: { startsWith: query.action } } : {}),
            ...(query.actorId ? { actorId: query.actorId } : {}),
            ...(query.targetType ? { targetType: query.targetType } : {}),
            ...(query.targetId ? { targetId: query.targetId } : {}),
            ...(query.q ? { OR: [{ actorEmail: { contains: query.q } }, { action: { contains: query.q } }, { targetId: query.q }] } : {}),
        };
        const [total, items, actions] = await Promise.all([
            prisma_1.prisma.auditLog.count({ where }),
            prisma_1.prisma.auditLog.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
            prisma_1.prisma.auditLog.groupBy({ by: ['action'], _count: true, orderBy: { action: 'asc' } }),
        ]);
        return { total, page: query.page, pageSize: query.pageSize, items, actions: actions.map((a) => a.action) };
    },
};
