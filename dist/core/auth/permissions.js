"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.hasPermission = exports.ALL_PERMISSIONS = exports.PERMISSIONS = void 0;
/** Admin-dashboard permissions granted to staff roles. Super admins (role "admin") have all of them. */
exports.PERMISSIONS = {
    'overview.view': 'View dashboard overview',
    'users.view': 'View users and their details',
    'users.manage': 'Edit, suspend and reactivate users',
    'users.limits': 'Change limits of individual users',
    'users.delete': 'Delete users',
    'workspaces.view': 'View workspaces',
    'workspaces.manage': 'Edit workspaces, members and member limits',
    'files.view': 'View uploaded files',
    'files.manage': 'Delete uploaded files',
    'reports.view': 'View reports and analytics',
    'audit.view': 'View the audit log',
    'staff.manage': 'Manage staff members',
    'roles.manage': 'Manage roles and permissions',
    'settings.manage': 'Change platform settings and default limits',
    'notifications.manage': 'Manage notification sounds and send announcements',
};
exports.ALL_PERMISSIONS = Object.keys(exports.PERMISSIONS);
const hasPermission = (ctx, permission) => !!ctx && (ctx.role === 'admin' || ctx.permissions.includes(permission));
exports.hasPermission = hasPermission;
