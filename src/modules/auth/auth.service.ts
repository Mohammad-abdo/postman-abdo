import bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { prisma, json } from '../../core/database/prisma';
import { Conflict, Forbidden, Unauthorized } from '../../core/errors/http-error';
import { signToken } from '../../core/middleware/auth.middleware';
import { workspaceService } from '../workspaces/workspace.service';
import { platformService } from '../platform/platform.service';
import { loadAuthUser } from '../../core/middleware/auth.middleware';
import { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schema';

export const toPublicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  role: u.role,
  status: u.status,
  avatarUrl: u.avatarUrl,
  bio: u.bio,
  company: u.company,
  jobTitle: u.jobTitle,
  location: u.location,
  website: u.website,
  createdAt: u.createdAt,
  settings: u.settings || {},
});

export const authService = {
  async register(input: RegisterInput) {
    if (!(await platformService.settings()).registrationOpen) throw Forbidden('Registration is currently closed');
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw Conflict('An account with this email already exists');
    }
    // The very first account becomes the platform super admin.
    const isFirstUser = (await prisma.user.count()) === 0;
    const user = await prisma.user.create({
      data: {
        role: isFirstUser ? 'admin' : 'user',
        lastLoginAt: new Date(),
        name: input.name || input.email.split('@')[0],
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        settings: {},
      },
    });
    await workspaceService.createPersonal(user.id);
    return { token: signToken(user.id, user.tokenVersion), user: toPublicUser(user) };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw Unauthorized('Invalid email or password');
    }
    if (user.status === 'suspended') throw Forbidden('Your account has been suspended. Contact support.');
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
    return { token: signToken(user.id, user.tokenVersion), user: toPublicUser(user) };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Unauthorized();
    const auth = await loadAuthUser(userId);
    return { ...toPublicUser(user), permissions: auth?.permissions || [], platform: await platformService.publicSettings() };
  },

  async updateProfile(userId: string, input: UpdateProfileInput) {
    const user = await prisma.user.update({
      where: { id: userId },
      data: { ...(input.name ? { name: input.name } : {}), ...(input.settings ? { settings: json(input.settings) } : {}) },
    });
    return toPublicUser(user);
  },

  async settings(userId: string): Promise<Record<string, any>> {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { settings: true } });
    return (user?.settings as Record<string, any>) || {};
  },
};
