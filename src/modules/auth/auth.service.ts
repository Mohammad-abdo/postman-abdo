import bcrypt from 'bcryptjs';
import { User } from '@prisma/client';
import { prisma, json } from '../../core/database/prisma';
import { Conflict, Unauthorized } from '../../core/errors/http-error';
import { signToken } from '../../core/middleware/auth.middleware';
import { workspaceService } from '../workspaces/workspace.service';
import { LoginInput, RegisterInput, UpdateProfileInput } from './auth.schema';

const toPublicUser = (u: User) => ({ id: u.id, name: u.name, email: u.email, settings: u.settings || {} });

export const authService = {
  async register(input: RegisterInput) {
    if (await prisma.user.findUnique({ where: { email: input.email } })) {
      throw Conflict('An account with this email already exists');
    }
    const user = await prisma.user.create({
      data: {
        name: input.name || input.email.split('@')[0],
        email: input.email,
        passwordHash: await bcrypt.hash(input.password, 10),
        settings: {},
      },
    });
    await workspaceService.create(user.id, { name: 'My Workspace', type: 'personal' });
    return { token: signToken(user.id), user: toPublicUser(user) };
  },

  async login(input: LoginInput) {
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user || !(await bcrypt.compare(input.password, user.passwordHash))) {
      throw Unauthorized('Invalid email or password');
    }
    return { token: signToken(user.id), user: toPublicUser(user) };
  },

  async me(userId: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw Unauthorized();
    return toPublicUser(user);
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
