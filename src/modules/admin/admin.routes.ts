import { Router } from 'express';
import { z } from 'zod';
import { requirePermission as can, requireStaff } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { adminController as c } from './admin.controller';
import {
  limitsSchema,
  promoteStaffSchema,
  roleSchema,
  settingsSchema,
  transferOwnershipSchema,
  updateRoleSchema,
  updateUserSchema,
  updateWorkspaceSchema,
} from './admin.schema';

/** Admin dashboard API: staff only, each route gated by a permission (super admins have all). */
export const adminRoutes = Router();

adminRoutes.use(requireStaff);

adminRoutes.get('/overview', can('overview.view'), c.overview);
adminRoutes.get('/reports', can('reports.view'), c.reports);

adminRoutes.get('/users', can('users.view'), c.listUsers);
adminRoutes.get('/users/:id', can('users.view'), c.getUser);
adminRoutes.patch('/users/:id', can('users.manage'), validateBody(updateUserSchema), c.updateUser);
adminRoutes.post('/users/:id/suspend', can('users.manage'), c.suspendUser);
adminRoutes.post('/users/:id/reactivate', can('users.manage'), c.reactivateUser);
adminRoutes.post('/users/:id/force-logout', can('users.manage'), c.forceLogout);
adminRoutes.post('/users/:id/reset-password', can('users.manage'), c.resetPassword);
adminRoutes.put('/users/:id/limits', can('users.limits'), validateBody(limitsSchema), c.setUserLimits);
adminRoutes.delete('/users/:id', can('users.delete'), c.deleteUser);

adminRoutes.get('/workspaces', can('workspaces.view'), c.listWorkspaces);
adminRoutes.get('/workspaces/:id', can('workspaces.view'), c.getWorkspace);
adminRoutes.put('/workspaces/:id', can('workspaces.manage'), validateBody(updateWorkspaceSchema), c.updateWorkspace);
adminRoutes.delete('/workspaces/:id', can('workspaces.manage'), c.deleteWorkspace);
adminRoutes.delete('/workspaces/:id/members/:userId', can('workspaces.manage'), c.removeWorkspaceMember);
adminRoutes.post('/workspaces/:id/transfer', can('workspaces.manage'), validateBody(transferOwnershipSchema), c.transferWorkspace);

adminRoutes.get('/permissions', c.permissions);
adminRoutes.get('/staff', can('staff.manage'), c.listStaff);
adminRoutes.post('/staff', can('staff.manage'), validateBody(promoteStaffSchema), c.promoteStaff);
adminRoutes.put('/staff/:userId/role', can('staff.manage'), validateBody(z.object({ staffRoleId: z.string().nullable() })), c.setStaffRole);
adminRoutes.delete('/staff/:userId', can('staff.manage'), c.demoteStaff);

adminRoutes.get('/roles', can('roles.manage'), c.listRoles);
adminRoutes.post('/roles', can('roles.manage'), validateBody(roleSchema), c.createRole);
adminRoutes.put('/roles/:id', can('roles.manage'), validateBody(updateRoleSchema), c.updateRole);
adminRoutes.delete('/roles/:id', can('roles.manage'), c.deleteRole);

adminRoutes.get('/files', can('files.view'), c.listFiles);
adminRoutes.delete('/files/:id', can('files.manage'), c.deleteFile);

adminRoutes.get('/audit', can('audit.view'), c.listAudit);
adminRoutes.get('/settings', can('settings.manage'), c.getSettings);
adminRoutes.put('/settings', can('settings.manage'), validateBody(settingsSchema), c.updateSettings);
