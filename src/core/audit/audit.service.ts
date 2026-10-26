import { Request } from 'express';
import { json, prisma } from '../database/prisma';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  details?: unknown;
}

/** Records who did what (admin actions, security-relevant user actions). Never throws. */
export function audit(req: Request | null, entry: AuditEntry) {
  return prisma.auditLog
    .create({
      data: {
        actorId: req?.auth?.id || null,
        actorEmail: req?.auth?.email || null,
        ip: req?.ip || null,
        action: entry.action,
        targetType: entry.targetType,
        targetId: entry.targetId,
        details: entry.details === undefined ? undefined : json(entry.details),
      },
    })
    .catch((e) => console.error('audit log failed', e));
}
