import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';
import { json, prisma } from '../../../core/database/prisma';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../../core/errors/http-error';
import { invalidateAuthUser } from '../../../core/middleware/auth.middleware';
import { AuthContext } from '../../../core/auth/permissions';
import { limitsService } from '../../platform/limits.service';
import { LimitsInput, UpdateUserInput, UserListQuery } from '../admin.schema';

const DAY = 86_400_000;

/** Safe projection: never expose password hashes or token versions. */
const userSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  staffRoleId: true,
  avatarUrl: true,
  company: true,
  jobTitle: true,
  location: true,
  website: true,
  bio: true,
  limits: true,
  lastSeenAt: true,
  lastLoginAt: true,
  createdAt: true,
  staffRole: { select: { id: true, name: true } },
} satisfies Prisma.UserSelect;

const SORTABLE = new Set(['createdAt', 'lastSeenAt', 'lastLoginAt', 'name', 'email']);

async function findOrThrow(id: string) {
  const user = await prisma.user.findUnique({ where: { id } });
  if (!user) throw NotFound('User not found');
  return user;
}

async function assertNotLastAdmin(userId: string) {
  const admins = await prisma.user.count({ where: { role: 'admin', id: { not: userId } } });
  if (!admins) throw BadRequest('There must be at least one super admin');
}

/** Only super admins may touch other admins or hand out staff/admin roles. */
function assertCanManage(actor: AuthContext, target: { id: string; role: string }) {
  if (target.role === 'admin' && actor.role !== 'admin') throw Forbidden('Only super admins can manage other admins');
}

export const adminUsersService = {
  async list(query: UserListQuery) {
    const where: Prisma.UserWhereInput = {
      ...(query.role ? { role: query.role } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(query.q ? { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }, { company: { contains: query.q } }] } : {}),
    };
    const sort = query.sort && SORTABLE.has(query.sort) ? query.sort : 'createdAt';
    const [total, users] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        select: { ...userSelect, _count: { select: { memberships: true, history: true, files: true } } },
        orderBy: { [sort]: query.order },
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    const ids = users.map((u) => u.id);
    const [owned, usage, pending] = await Promise.all([
      prisma.workspace.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids } }, _count: true }),
      prisma.usageDaily.groupBy({ by: ['userId'], where: { userId: { in: ids }, date: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { requests: true } }),
      prisma.syncDevice.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _sum: { pendingOps: true } }),
    ]);
    const ownedBy = new Map(owned.map((o) => [o.ownerId, o._count]));
    const usageBy = new Map(usage.map((u) => [u.userId, u._sum.requests || 0]));
    const pendingBy = new Map(pending.map((p) => [p.userId, p._sum.pendingOps || 0]));
    return {
      total,
      page: query.page,
      pageSize: query.pageSize,
      items: users.map(({ _count, ...u }) => ({
        ...u,
        workspaces: _count.memberships,
        ownedWorkspaces: ownedBy.get(u.id) || 0,
        historyCount: _count.history,
        files: _count.files,
        requests30d: usageBy.get(u.id) || 0,
        pendingSync: pendingBy.get(u.id) || 0,
      })),
    };
  },

  /** Everything about one user: profile, limits, usage, workspaces, content, files, devices, activity. */
  async detail(id: string) {
    const user = await prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!user) throw NotFound('User not found');
    const since = new Date(Date.now() - 30 * DAY);
    const [memberships, projectMemberships, usage, files, devices, activity, history, summary] = await Promise.all([
      prisma.workspaceMember.findMany({
        where: { userId: id },
        include: { workspace: { include: { _count: { select: { members: true, collections: true, projects: true, environments: true } } } } },
      }),
      prisma.projectMember.findMany({ where: { userId: id }, include: { project: { select: { id: true, name: true, color: true, workspaceId: true } } } }),
      prisma.usageDaily.findMany({ where: { userId: id, date: { gte: since } }, orderBy: { date: 'asc' } }),
      prisma.uploadedFile.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
      prisma.syncDevice.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' } }),
      prisma.auditLog.findMany({ where: { OR: [{ targetId: id }, { actorId: id }] }, orderBy: { createdAt: 'desc' }, take: 50 }),
      prisma.historyItem.count({ where: { userId: id } }),
      limitsService.summary(id),
    ]);
    const workspaceIds = memberships.map((m) => m.workspaceId);
    const [collections, requests, environments] = await Promise.all([
      prisma.collection.count({ where: { workspaceId: { in: workspaceIds }, deletedAt: null } }),
      prisma.request.count({ where: { collection: { workspaceId: { in: workspaceIds } } } }),
      prisma.environment.count({ where: { workspaceId: { in: workspaceIds }, isGlobal: false } }),
    ]);
    return {
      user,
      limits: { effective: summary.limits, overrides: (user.limits as Record<string, unknown>) || {} },
      usage: {
        ...summary.usage,
        daily: usage.map((u) => ({ date: u.date.toISOString().slice(0, 10), requests: u.requests, runs: u.runs, errors: u.errors, bytesIn: Number(u.bytesIn) })),
      },
      counts: { workspaces: memberships.length, projects: projectMemberships.length, collections, requests, environments, history },
      workspaces: memberships.map((m) => ({
        id: m.workspace.id,
        name: m.workspace.name,
        type: m.workspace.type,
        role: m.role,
        isOwner: m.workspace.ownerId === id,
        memberLimit: m.workspace.memberLimit,
        ...m.workspace._count,
      })),
      projects: projectMemberships.map((p) => ({ ...p.project, role: p.role })),
      files,
      devices: devices.map((d) => ({ ...d, synced: d.pendingOps === 0 })),
      activity,
    };
  },

  async update(actor: AuthContext, id: string, input: UpdateUserInput) {
    const target = await findOrThrow(id);
    assertCanManage(actor, target);
    if (input.role && input.role !== target.role) {
      if (actor.role !== 'admin') throw Forbidden('Only super admins can change roles');
      if (target.role === 'admin' && input.role !== 'admin') await assertNotLastAdmin(id);
    }
    if (input.status === 'suspended' && id === actor.id) throw BadRequest('You cannot suspend yourself');
    if (input.email && input.email !== target.email && (await prisma.user.findUnique({ where: { email: input.email } }))) {
      throw Conflict('Another account already uses this email');
    }
    const revoke = (input.status === 'suspended' && target.status !== 'suspended') || (input.role && input.role !== target.role);
    const user = await prisma.user.update({
      where: { id },
      data: {
        ...input,
        ...(input.role === 'user' ? { staffRoleId: null } : {}),
        ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
      },
      select: userSelect,
    });
    await invalidateAuthUser(id);
    return user;
  },

  setStatus(actor: AuthContext, id: string, status: 'active' | 'suspended') {
    return this.update(actor, id, { status });
  },

  async forceLogout(actor: AuthContext, id: string) {
    assertCanManage(actor, await findOrThrow(id));
    await prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
    await invalidateAuthUser(id);
  },

  /** Sets a random temporary password (returned once) and signs the user out everywhere. */
  async resetPassword(actor: AuthContext, id: string) {
    assertCanManage(actor, await findOrThrow(id));
    const temporaryPassword = crypto.randomBytes(9).toString('base64url');
    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(temporaryPassword, 10), tokenVersion: { increment: 1 } },
    });
    await invalidateAuthUser(id);
    return { temporaryPassword };
  },

  /** Merges overrides; a `null` value removes that override. */
  async setLimits(actor: AuthContext, id: string, input: LimitsInput) {
    const target = await findOrThrow(id);
    assertCanManage(actor, target);
    const next: Record<string, unknown> = { ...((target.limits as Record<string, unknown>) || {}) };
    Object.entries(input).forEach(([key, value]) => {
      if (value === null) delete next[key];
      else if (value !== undefined) next[key] = value;
    });
    await prisma.user.update({ where: { id }, data: { limits: Object.keys(next).length ? json(next) : Prisma.DbNull } });
    return (await limitsService.summary(id)).limits;
  },

  async remove(actor: AuthContext, id: string) {
    if (actor.role !== 'admin') throw Forbidden('Only super admins can delete users');
    if (id === actor.id) throw BadRequest('You cannot delete your own account here');
    const target = await findOrThrow(id);
    if (target.role === 'admin') await assertNotLastAdmin(id);
    // Workspaces owned by the user are removed with them; shared workspaces keep their other members.
    await prisma.$transaction([prisma.workspace.deleteMany({ where: { ownerId: id } }), prisma.user.delete({ where: { id } })]);
    await invalidateAuthUser(id);
    return { email: target.email };
  },
};
