"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.accountService = void 0;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const audit_service_1 = require("../../core/audit/audit.service");
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const auth_service_1 = require("../auth/auth.service");
const limits_service_1 = require("../platform/limits.service");
const DAY = 86_400_000;
async function findUser(userId) {
    const user = await prisma_1.prisma.user.findUnique({ where: { id: userId } });
    if (!user)
        throw (0, http_error_1.NotFound)('Account not found');
    return user;
}
/** Revokes every token issued so far and returns a fresh one for the current device. */
async function rotateTokens(userId) {
    const user = await prisma_1.prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await (0, auth_middleware_1.invalidateAuthUser)(userId);
    return (0, auth_middleware_1.signToken)(user.id, user.tokenVersion);
}
exports.accountService = {
    async overview(userId) {
        const [user, summary, memberships, devices] = await Promise.all([
            findUser(userId),
            limits_service_1.limitsService.summary(userId),
            prisma_1.prisma.workspaceMember.findMany({
                where: { userId },
                include: { workspace: { select: { id: true, name: true, type: true, ownerId: true, createdAt: true, _count: { select: { members: true, collections: true } } } } },
            }),
            prisma_1.prisma.syncDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' }, take: 20 }),
        ]);
        return {
            user: { ...(0, auth_service_1.toPublicUser)(user), lastLoginAt: user.lastLoginAt },
            ...summary,
            workspaces: memberships.map((m) => ({
                id: m.workspace.id,
                name: m.workspace.name,
                type: m.workspace.type,
                role: m.role,
                isOwner: m.workspace.ownerId === userId,
                members: m.workspace._count.members,
                collections: m.workspace._count.collections,
                createdAt: m.workspace.createdAt,
            })),
            devices,
        };
    },
    async updateProfile(userId, input) {
        const user = await prisma_1.prisma.user.update({ where: { id: userId }, data: input });
        await (0, auth_middleware_1.invalidateAuthUser)(userId);
        return (0, auth_service_1.toPublicUser)(user);
    },
    async setAvatar(userId, dataUrl) {
        const user = await prisma_1.prisma.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
        return (0, auth_service_1.toPublicUser)(user);
    },
    async changePassword(req, userId, input) {
        const user = await findUser(userId);
        if (!(await bcryptjs_1.default.compare(input.currentPassword, user.passwordHash)))
            throw (0, http_error_1.BadRequest)('Current password is incorrect');
        if (input.currentPassword === input.newPassword)
            throw (0, http_error_1.BadRequest)('The new password must be different');
        await prisma_1.prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcryptjs_1.default.hash(input.newPassword, 10) } });
        (0, audit_service_1.audit)(req, { action: 'account.password_changed', targetType: 'user', targetId: userId });
        return { token: await rotateTokens(userId) };
    },
    async logoutEverywhere(req, userId) {
        (0, audit_service_1.audit)(req, { action: 'account.logout_all', targetType: 'user', targetId: userId });
        return { token: await rotateTokens(userId) };
    },
    /** Requests, runs and errors per day for the last 30 days (missing days filled with zeros). */
    async activity(userId, days = 30) {
        const since = new Date(Date.now() - (days - 1) * DAY);
        since.setUTCHours(0, 0, 0, 0);
        const rows = await prisma_1.prisma.usageDaily.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: 'asc' } });
        const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
        return Array.from({ length: days }, (_, i) => {
            const date = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
            const row = byDay.get(date);
            return { date, requests: row?.requests || 0, runs: row?.runs || 0, errors: row?.errors || 0 };
        });
    },
    async updatePreferences(userId, settings) {
        const user = await findUser(userId);
        const merged = { ...(user.settings || {}), ...settings };
        const updated = await prisma_1.prisma.user.update({ where: { id: userId }, data: { settings: (0, prisma_1.json)(merged) } });
        return (0, auth_service_1.toPublicUser)(updated);
    },
};
