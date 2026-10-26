import { prisma } from '../../../core/database/prisma';
import { ALL_PERMISSIONS, PERMISSIONS } from '../../../core/auth/permissions';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../../core/errors/http-error';
import { invalidateAuthUser } from '../../../core/middleware/auth.middleware';
import { AuthContext } from '../../../core/auth/permissions';
import { PromoteStaffInput, RoleInput } from '../admin.schema';

const staffSelect = {
  id: true,
  name: true,
  email: true,
  role: true,
  status: true,
  avatarUrl: true,
  lastSeenAt: true,
  createdAt: true,
  staffRole: { select: { id: true, name: true } },
} as const;

/** Groups permissions by area ("users", "roles"...) for the role editor. */
function permissionCatalog() {
  const groups = new Map<string, { key: string; label: string }[]>();
  ALL_PERMISSIONS.forEach((key) => {
    const area = key.split('.')[0];
    groups.set(area, [...(groups.get(area) || []), { key, label: PERMISSIONS[key] }]);
  });
  return Array.from(groups, ([area, permissions]) => ({ area, permissions }));
}

async function assertRoleExists(id: string | null | undefined) {
  if (id && !(await prisma.staffRole.findUnique({ where: { id } }))) throw BadRequest('Unknown role');
}

export const adminStaffService = {
  permissions: permissionCatalog,

  listStaff() {
    return prisma.user.findMany({ where: { role: { in: ['staff', 'admin'] } }, select: staffSelect, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] });
  },

  /** Promotes an existing account; granting super admin requires a super admin. */
  async promote(actor: AuthContext, input: PromoteStaffInput) {
    if (input.role === 'admin' && actor.role !== 'admin') throw Forbidden('Only super admins can create super admins');
    const user = await prisma.user.findUnique({ where: { email: input.email } });
    if (!user) throw NotFound('No account uses this email. Ask them to sign up first.');
    await assertRoleExists(input.staffRoleId);
    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { role: input.role, staffRoleId: input.role === 'staff' ? input.staffRoleId || null : null, tokenVersion: { increment: 1 } },
      select: staffSelect,
    });
    await invalidateAuthUser(user.id);
    return updated;
  },

  async setStaffRole(id: string, staffRoleId: string | null) {
    await assertRoleExists(staffRoleId);
    const user = await prisma.user.update({ where: { id }, data: { staffRoleId }, select: staffSelect });
    await invalidateAuthUser(id);
    return user;
  },

  async demote(actor: AuthContext, id: string) {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) throw NotFound('User not found');
    if (id === actor.id) throw BadRequest('You cannot remove your own staff access');
    if (user.role === 'admin') {
      if (actor.role !== 'admin') throw Forbidden('Only super admins can demote admins');
      if (!(await prisma.user.count({ where: { role: 'admin', id: { not: id } } }))) throw BadRequest('There must be at least one super admin');
    }
    await prisma.user.update({ where: { id }, data: { role: 'user', staffRoleId: null, tokenVersion: { increment: 1 } } });
    await invalidateAuthUser(id);
  },

  /* ---------- roles ---------- */
  async listRoles() {
    const roles = await prisma.staffRole.findMany({
      orderBy: { createdAt: 'asc' },
      include: { users: { select: { id: true, name: true, email: true, avatarUrl: true }, orderBy: { name: 'asc' } } },
    });
    return roles.map(({ users, ...r }) => ({ ...r, members: users.length, users }));
  },

  async createRole(input: RoleInput) {
    if (await prisma.staffRole.findUnique({ where: { name: input.name } })) throw Conflict('A role with this name exists');
    return prisma.staffRole.create({ data: { name: input.name, description: input.description || null, permissions: input.permissions } });
  },

  /** Copies a role's permissions under a free "<name> Copy" name. */
  async duplicateRole(id: string) {
    const role = await prisma.staffRole.findUnique({ where: { id } });
    if (!role) throw NotFound('Role not found');
    let name = `${role.name} Copy`;
    for (let i = 2; await prisma.staffRole.findUnique({ where: { name } }); i++) name = `${role.name} Copy ${i}`;
    return prisma.staffRole.create({ data: { name, description: role.description, permissions: role.permissions as string[] } });
  },

  async updateRole(id: string, input: Partial<RoleInput>) {
    const role = await prisma.staffRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
    if (!role) throw NotFound('Role not found');
    const updated = await prisma.staffRole.update({ where: { id }, data: input });
    // Permissions are cached per user; refresh everyone holding the role.
    await Promise.all(role.users.map((u) => invalidateAuthUser(u.id)));
    return updated;
  },

  async removeRole(id: string) {
    const role = await prisma.staffRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
    if (!role) throw NotFound('Role not found');
    await prisma.staffRole.delete({ where: { id } });
    await Promise.all(role.users.map((u) => invalidateAuthUser(u.id)));
    return role;
  },
};
