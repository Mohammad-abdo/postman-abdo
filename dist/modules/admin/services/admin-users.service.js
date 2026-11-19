"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminUsersService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const crypto_1 = __importDefault(require("crypto"));
const client_1 = require("@prisma/client");
const prisma_1 = require("../../../core/database/prisma");
const http_error_1 = require("../../../core/errors/http-error");
const auth_middleware_1 = require("../../../core/middleware/auth.middleware");
const limits_service_1 = require("../../platform/limits.service");
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
};
const SORTABLE = new Set(['createdAt', 'lastSeenAt', 'lastLoginAt', 'name', 'email']);
async function findOrThrow(id) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id } });
    if (!user)
        throw (0, http_error_1.NotFound)('User not found');
    return user;
}
async function assertNotLastAdmin(userId) {
    const admins = await prisma_1.prisma.user.count({ where: { role: 'admin', id: { not: userId } } });
    if (!admins)
        throw (0, http_error_1.BadRequest)('There must be at least one super admin');
}
/** Only super admins may touch other admins or hand out staff/admin roles. */
function assertCanManage(actor, target) {
    if (target.role === 'admin' && actor.role !== 'admin')
        throw (0, http_error_1.Forbidden)('Only super admins can manage other admins');
}
exports.adminUsersService = {
    async list(query) {
        const where = {
            ...(query.role ? { role: query.role } : {}),
            ...(query.status ? { status: query.status } : {}),
            ...(query.q ? { OR: [{ name: { contains: query.q } }, { email: { contains: query.q } }, { company: { contains: query.q } }] } : {}),
        };
        const sort = query.sort && SORTABLE.has(query.sort) ? query.sort : 'createdAt';
        const [total, users] = await Promise.all([
            prisma_1.prisma.user.count({ where }),
            prisma_1.prisma.user.findMany({
                where,
                select: { ...userSelect, _count: { select: { memberships: true, history: true, files: true } } },
                orderBy: { [sort]: query.order },
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
        ]);
        const ids = users.map((u) => u.id);
        const [owned, usage, pending] = await Promise.all([
            prisma_1.prisma.workspace.groupBy({ by: ['ownerId'], where: { ownerId: { in: ids } }, _count: true }),
            prisma_1.prisma.usageDaily.groupBy({ by: ['userId'], where: { userId: { in: ids }, date: { gte: new Date(Date.now() - 30 * DAY) } }, _sum: { requests: true } }),
            prisma_1.prisma.syncDevice.groupBy({ by: ['userId'], where: { userId: { in: ids } }, _sum: { pendingOps: true } }),
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
    async detail(id) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id }, select: userSelect });
        if (!user)
            throw (0, http_error_1.NotFound)('User not found');
        const since = new Date(Date.now() - 30 * DAY);
        const [memberships, projectMemberships, usage, files, devices, activity, history, summary] = await Promise.all([
            prisma_1.prisma.workspaceMember.findMany({
                where: { userId: id },
                include: { workspace: { include: { _count: { select: { members: true, collections: true, projects: true, environments: true } } } } },
            }),
            prisma_1.prisma.projectMember.findMany({ where: { userId: id }, include: { project: { select: { id: true, name: true, color: true, workspaceId: true } } } }),
            prisma_1.prisma.usageDaily.findMany({ where: { userId: id, date: { gte: since } }, orderBy: { date: 'asc' } }),
            prisma_1.prisma.uploadedFile.findMany({ where: { userId: id }, orderBy: { createdAt: 'desc' } }),
            prisma_1.prisma.syncDevice.findMany({ where: { userId: id }, orderBy: { lastSeenAt: 'desc' } }),
            prisma_1.prisma.auditLog.findMany({ where: { OR: [{ targetId: id }, { actorId: id }] }, orderBy: { createdAt: 'desc' }, take: 50 }),
            prisma_1.prisma.historyItem.count({ where: { userId: id } }),
            limits_service_1.limitsService.summary(id),
        ]);
        const workspaceIds = memberships.map((m) => m.workspaceId);
        const [collections, requests, environments] = await Promise.all([
            prisma_1.prisma.collection.count({ where: { workspaceId: { in: workspaceIds }, deletedAt: null } }),
            prisma_1.prisma.request.count({ where: { collection: { workspaceId: { in: workspaceIds } } } }),
            prisma_1.prisma.environment.count({ where: { workspaceId: { in: workspaceIds }, isGlobal: false } }),
        ]);
        return {
            user,
            limits: { effective: summary.limits, overrides: user.limits || {} },
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
    async update(actor, id, input) {
        const target = await findOrThrow(id);
        assertCanManage(actor, target);
        if (input.role && input.role !== target.role) {
            if (actor.role !== 'admin')
                throw (0, http_error_1.Forbidden)('Only super admins can change roles');
            if (target.role === 'admin' && input.role !== 'admin')
                await assertNotLastAdmin(id);
        }
        if (input.status === 'suspended' && id === actor.id)
            throw (0, http_error_1.BadRequest)('You cannot suspend yourself');
        if (input.email && input.email !== target.email && (await prisma_1.prisma.user.findUnique({ where: { email: input.email } }))) {
            throw (0, http_error_1.Conflict)('Another account already uses this email');
        }
        const revoke = (input.status === 'suspended' && target.status !== 'suspended') || (input.role && input.role !== target.role);
        const user = await prisma_1.prisma.user.update({
            where: { id },
            data: {
                ...input,
                ...(input.role === 'user' ? { staffRoleId: null } : {}),
                ...(revoke ? { tokenVersion: { increment: 1 } } : {}),
            },
            select: userSelect,
        });
        await (0, auth_middleware_1.invalidateAuthUser)(id);
        return user;
    },
    setStatus(actor, id, status) {
        return this.update(actor, id, { status });
    },
    async forceLogout(actor, id) {
        assertCanManage(actor, await findOrThrow(id));
        await prisma_1.prisma.user.update({ where: { id }, data: { tokenVersion: { increment: 1 } } });
        await (0, auth_middleware_1.invalidateAuthUser)(id);
    },
    /** Sets a random temporary password (returned once) and signs the user out everywhere. */
    async resetPassword(actor, id) {
        assertCanManage(actor, await findOrThrow(id));
        const temporaryPassword = crypto_1.default.randomBytes(9).toString('base64url');
        await prisma_1.prisma.user.update({
            where: { id },
            data: { passwordHash: await bcryptjs_1.default.hash(temporaryPassword, 10), tokenVersion: { increment: 1 } },
        });
        await (0, auth_middleware_1.invalidateAuthUser)(id);
        return { temporaryPassword };
    },
    /** Merges overrides; a `null` value removes that override. */
    async setLimits(actor, id, input) {
        const target = await findOrThrow(id);
        assertCanManage(actor, target);
        const next = { ...(target.limits || {}) };
        Object.entries(input).forEach(([key, value]) => {
            if (value === null)
                delete next[key];
            else if (value !== undefined)
                next[key] = value;
        });
        await prisma_1.prisma.user.update({ where: { id }, data: { limits: Object.keys(next).length ? (0, prisma_1.json)(next) : client_1.Prisma.DbNull } });
        return (await limits_service_1.limitsService.summary(id)).limits;
    },
    async remove(actor, id) {
        if (actor.role !== 'admin')
            throw (0, http_error_1.Forbidden)('Only super admins can delete users');
        if (id === actor.id)
            throw (0, http_error_1.BadRequest)('You cannot delete your own account here');
        const target = await findOrThrow(id);
        if (target.role === 'admin')
            await assertNotLastAdmin(id);
        // Workspaces owned by the user are removed with them; shared workspaces keep their other members.
        await prisma_1.prisma.$transaction([prisma_1.prisma.workspace.deleteMany({ where: { ownerId: id } }), prisma_1.prisma.user.delete({ where: { id } })]);
        await (0, auth_middleware_1.invalidateAuthUser)(id);
        return { email: target.email };
    },
};
