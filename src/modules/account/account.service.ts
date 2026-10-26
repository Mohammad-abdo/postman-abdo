import bcrypt from 'bcryptjs';
import { Request } from 'express';
import { audit } from '../../core/audit/audit.service';
import { json, prisma } from '../../core/database/prisma';
import { BadRequest, NotFound } from '../../core/errors/http-error';
import { invalidateAuthUser, signToken } from '../../core/middleware/auth.middleware';
import { toPublicUser } from '../auth/auth.service';
import { limitsService } from '../platform/limits.service';
import { ChangePasswordInput, UpdateProfileInput } from './account.schema';

const DAY = 86_400_000;

async function findUser(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('Account not found');
  return user;
}

/** Revokes every token issued so far and returns a fresh one for the current device. */
async function rotateTokens(userId: string) {
  const user = await prisma.user.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
  await invalidateAuthUser(userId);
  return signToken(user.id, user.tokenVersion);
}

export const accountService = {
  async overview(userId: string) {
    const [user, summary, memberships, devices] = await Promise.all([
      findUser(userId),
      limitsService.summary(userId),
      prisma.workspaceMember.findMany({
        where: { userId },
        include: { workspace: { select: { id: true, name: true, type: true, ownerId: true, createdAt: true, _count: { select: { members: true, collections: true } } } } },
      }),
      prisma.syncDevice.findMany({ where: { userId }, orderBy: { lastSeenAt: 'desc' }, take: 20 }),
    ]);
    return {
      user: { ...toPublicUser(user), lastLoginAt: user.lastLoginAt },
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

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({ where: { id: userId }, data: input });
    await invalidateAuthUser(userId);
    return toPublicUser(user);
  },

  async setAvatar(userId: string, dataUrl: string | null) {
    const user = await prisma.user.update({ where: { id: userId }, data: { avatarUrl: dataUrl } });
    return toPublicUser(user);
  },

  async changePassword(req: Request, userId: string, input: ChangePasswordInput) {
    const user = await findUser(userId);
    if (!(await bcrypt.compare(input.currentPassword, user.passwordHash))) throw BadRequest('Current password is incorrect');
    if (input.currentPassword === input.newPassword) throw BadRequest('The new password must be different');
    await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(input.newPassword, 10) } });
    audit(req, { action: 'account.password_changed', targetType: 'user', targetId: userId });
    return { token: await rotateTokens(userId) };
  },

  async logoutEverywhere(req: Request, userId: string) {
    audit(req, { action: 'account.logout_all', targetType: 'user', targetId: userId });
    return { token: await rotateTokens(userId) };
  },

  /** Requests, runs and errors per day for the last 30 days (missing days filled with zeros). */
  async activity(userId: string, days = 30) {
    const since = new Date(Date.now() - (days - 1) * DAY);
    since.setUTCHours(0, 0, 0, 0);
    const rows = await prisma.usageDaily.findMany({ where: { userId, date: { gte: since } }, orderBy: { date: 'asc' } });
    const byDay = new Map(rows.map((r) => [r.date.toISOString().slice(0, 10), r]));
    return Array.from({ length: days }, (_, i) => {
      const date = new Date(since.getTime() + i * DAY).toISOString().slice(0, 10);
      const row = byDay.get(date);
      return { date, requests: row?.requests || 0, runs: row?.runs || 0, errors: row?.errors || 0 };
    });
  },

  async updatePreferences(userId: string, settings: Record<string, unknown>) {
    const user = await findUser(userId);
    const merged = { ...((user.settings as Record<string, unknown>) || {}), ...settings };
    const updated = await prisma.user.update({ where: { id: userId }, data: { settings: json(merged) } });
    return toPublicUser(updated);
  },
};
