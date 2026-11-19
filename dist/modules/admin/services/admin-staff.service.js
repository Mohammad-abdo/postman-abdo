"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminStaffService = void 0;
const prisma_1 = require("../../../core/database/prisma");
const permissions_1 = require("../../../core/auth/permissions");
const http_error_1 = require("../../../core/errors/http-error");
const auth_middleware_1 = require("../../../core/middleware/auth.middleware");
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
};
/** Groups permissions by area ("users", "roles"...) for the role editor. */
function permissionCatalog() {
    const groups = new Map();
    permissions_1.ALL_PERMISSIONS.forEach((key) => {
        const area = key.split('.')[0];
        groups.set(area, [...(groups.get(area) || []), { key, label: permissions_1.PERMISSIONS[key] }]);
    });
    return Array.from(groups, ([area, permissions]) => ({ area, permissions }));
}
async function assertRoleExists(id) {
    if (id && !(await prisma_1.prisma.staffRole.findUnique({ where: { id } })))
        throw (0, http_error_1.BadRequest)('Unknown role');
}
exports.adminStaffService = {
    permissions: permissionCatalog,
    listStaff() {
        return prisma_1.prisma.user.findMany({ where: { role: { in: ['staff', 'admin'] } }, select: staffSelect, orderBy: [{ role: 'asc' }, { createdAt: 'asc' }] });
    },
    /** Promotes an existing account; granting super admin requires a super admin. */
    async promote(actor, input) {
        if (input.role === 'admin' && actor.role !== 'admin')
            throw (0, http_error_1.Forbidden)('Only super admins can create super admins');
        const user = await prisma_1.prisma.user.findUnique({ where: { email: input.email } });
        if (!user)
            throw (0, http_error_1.NotFound)('No account uses this email. Ask them to sign up first.');
        await assertRoleExists(input.staffRoleId);
        const updated = await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { role: input.role, staffRoleId: input.role === 'staff' ? input.staffRoleId || null : null, tokenVersion: { increment: 1 } },
            select: staffSelect,
        });
        await (0, auth_middleware_1.invalidateAuthUser)(user.id);
        return updated;
    },
    async setStaffRole(id, staffRoleId) {
        await assertRoleExists(staffRoleId);
        const user = await prisma_1.prisma.user.update({ where: { id }, data: { staffRoleId }, select: staffSelect });
        await (0, auth_middleware_1.invalidateAuthUser)(id);
        return user;
    },
    async demote(actor, id) {
        const user = await prisma_1.prisma.user.findUnique({ where: { id } });
        if (!user)
            throw (0, http_error_1.NotFound)('User not found');
        if (id === actor.id)
            throw (0, http_error_1.BadRequest)('You cannot remove your own staff access');
        if (user.role === 'admin') {
            if (actor.role !== 'admin')
                throw (0, http_error_1.Forbidden)('Only super admins can demote admins');
            if (!(await prisma_1.prisma.user.count({ where: { role: 'admin', id: { not: id } } })))
                throw (0, http_error_1.BadRequest)('There must be at least one super admin');
        }
        await prisma_1.prisma.user.update({ where: { id }, data: { role: 'user', staffRoleId: null, tokenVersion: { increment: 1 } } });
        await (0, auth_middleware_1.invalidateAuthUser)(id);
    },
    /* ---------- roles ---------- */
    async listRoles() {
        const roles = await prisma_1.prisma.staffRole.findMany({
            orderBy: { createdAt: 'asc' },
            include: { users: { select: { id: true, name: true, email: true, avatarUrl: true }, orderBy: { name: 'asc' } } },
        });
        return roles.map(({ users, ...r }) => ({ ...r, members: users.length, users }));
    },
    async createRole(input) {
        if (await prisma_1.prisma.staffRole.findUnique({ where: { name: input.name } }))
            throw (0, http_error_1.Conflict)('A role with this name exists');
        return prisma_1.prisma.staffRole.create({ data: { name: input.name, description: input.description || null, permissions: input.permissions } });
    },
    /** Copies a role's permissions under a free "<name> Copy" name. */
    async duplicateRole(id) {
        const role = await prisma_1.prisma.staffRole.findUnique({ where: { id } });
        if (!role)
            throw (0, http_error_1.NotFound)('Role not found');
        let name = `${role.name} Copy`;
        for (let i = 2; await prisma_1.prisma.staffRole.findUnique({ where: { name } }); i++)
            name = `${role.name} Copy ${i}`;
        return prisma_1.prisma.staffRole.create({ data: { name, description: role.description, permissions: role.permissions } });
    },
    async updateRole(id, input) {
        const role = await prisma_1.prisma.staffRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
        if (!role)
            throw (0, http_error_1.NotFound)('Role not found');
        const updated = await prisma_1.prisma.staffRole.update({ where: { id }, data: input });
        // Permissions are cached per user; refresh everyone holding the role.
        await Promise.all(role.users.map((u) => (0, auth_middleware_1.invalidateAuthUser)(u.id)));
        return updated;
    },
    async removeRole(id) {
        const role = await prisma_1.prisma.staffRole.findUnique({ where: { id }, include: { users: { select: { id: true } } } });
        if (!role)
            throw (0, http_error_1.NotFound)('Role not found');
        await prisma_1.prisma.staffRole.delete({ where: { id } });
        await Promise.all(role.users.map((u) => (0, auth_middleware_1.invalidateAuthUser)(u.id)));
        return role;
    },
};
