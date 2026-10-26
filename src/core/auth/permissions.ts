/** Admin-dashboard permissions granted to staff roles. Super admins (role "admin") have all of them. */
export const PERMISSIONS = {
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
} as const;

export type Permission = keyof typeof PERMISSIONS;
export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

export interface AuthContext {
  id: string;
  email: string;
  role: 'user' | 'staff' | 'admin';
  permissions: Permission[];
}

export const hasPermission = (ctx: AuthContext | undefined, permission: Permission) =>
  !!ctx && (ctx.role === 'admin' || ctx.permissions.includes(permission));
