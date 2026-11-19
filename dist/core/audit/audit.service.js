"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.audit = audit;
const prisma_1 = require("../database/prisma");
/** Records who did what (admin actions, security-relevant user actions). Never throws. */
function audit(req, entry) {
    return prisma_1.prisma.auditLog
        .create({
        data: {
            actorId: req?.auth?.id || null,
            actorEmail: req?.auth?.email || null,
            ip: req?.ip || null,
            action: entry.action,
            targetType: entry.targetType,
            targetId: entry.targetId,
            details: entry.details === undefined ? undefined : (0, prisma_1.json)(entry.details),
        },
    })
        .catch((e) => console.error('audit log failed', e));
}
