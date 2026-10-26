import { Request, Response } from 'express';
import { audit } from '../../core/audit/audit.service';
import { cache, cacheKeys } from '../../core/cache/cache.service';
import { platformService } from '../platform/platform.service';
import {
  auditQuerySchema,
  fileQuerySchema,
  listQuerySchema,
  reportQuerySchema,
  userListQuerySchema,
} from './admin.schema';
import { adminAuditService } from './services/admin-audit.service';
import { adminFilesService } from './services/admin-files.service';
import { adminReportsService } from './services/admin-reports.service';
import { adminStaffService } from './services/admin-staff.service';
import { adminUsersService } from './services/admin-users.service';
import { adminWorkspacesService } from './services/admin-workspaces.service';

const actor = (req: Request) => req.auth!;
const ok = (res: Response) => res.json({ ok: true });
const refreshOverview = () => cache.invalidate(cacheKeys.adminOverview());

export const adminController = {
  /* ---------- dashboard ---------- */
  overview: async (_req: Request, res: Response) => res.json(await adminReportsService.overview()),
  reports: async (req: Request, res: Response) => res.json(await adminReportsService.reports(reportQuerySchema.parse(req.query).days)),

  /* ---------- users ---------- */
  listUsers: async (req: Request, res: Response) => res.json(await adminUsersService.list(userListQuerySchema.parse(req.query))),
  getUser: async (req: Request, res: Response) => res.json(await adminUsersService.detail(req.params.id)),
  updateUser: async (req: Request, res: Response) => {
    const user = await adminUsersService.update(actor(req), req.params.id, req.body);
    audit(req, { action: 'user.update', targetType: 'user', targetId: req.params.id, details: req.body });
    res.json(user);
  },
  suspendUser: async (req: Request, res: Response) => {
    const user = await adminUsersService.setStatus(actor(req), req.params.id, 'suspended');
    audit(req, { action: 'user.suspend', targetType: 'user', targetId: req.params.id, details: { reason: req.body?.reason } });
    await refreshOverview();
    res.json(user);
  },
  reactivateUser: async (req: Request, res: Response) => {
    const user = await adminUsersService.setStatus(actor(req), req.params.id, 'active');
    audit(req, { action: 'user.reactivate', targetType: 'user', targetId: req.params.id });
    await refreshOverview();
    res.json(user);
  },
  forceLogout: async (req: Request, res: Response) => {
    await adminUsersService.forceLogout(actor(req), req.params.id);
    audit(req, { action: 'user.force_logout', targetType: 'user', targetId: req.params.id });
    ok(res);
  },
  resetPassword: async (req: Request, res: Response) => {
    const result = await adminUsersService.resetPassword(actor(req), req.params.id);
    audit(req, { action: 'user.reset_password', targetType: 'user', targetId: req.params.id });
    res.json(result);
  },
  setUserLimits: async (req: Request, res: Response) => {
    const limits = await adminUsersService.setLimits(actor(req), req.params.id, req.body);
    audit(req, { action: 'user.limits', targetType: 'user', targetId: req.params.id, details: req.body });
    res.json(limits);
  },
  deleteUser: async (req: Request, res: Response) => {
    const { email } = await adminUsersService.remove(actor(req), req.params.id);
    audit(req, { action: 'user.delete', targetType: 'user', targetId: req.params.id, details: { email } });
    await refreshOverview();
    ok(res);
  },

  /* ---------- workspaces ---------- */
  listWorkspaces: async (req: Request, res: Response) => res.json(await adminWorkspacesService.list(listQuerySchema.parse(req.query))),
  getWorkspace: async (req: Request, res: Response) => res.json(await adminWorkspacesService.detail(req.params.id)),
  updateWorkspace: async (req: Request, res: Response) => {
    const workspace = await adminWorkspacesService.update(req.params.id, req.body);
    audit(req, { action: 'workspace.update', targetType: 'workspace', targetId: req.params.id, details: req.body });
    res.json(workspace);
  },
  removeWorkspaceMember: async (req: Request, res: Response) => {
    await adminWorkspacesService.removeMember(req.params.id, req.params.userId);
    audit(req, { action: 'workspace.member_remove', targetType: 'workspace', targetId: req.params.id, details: { userId: req.params.userId } });
    ok(res);
  },
  transferWorkspace: async (req: Request, res: Response) => {
    await adminWorkspacesService.transferOwnership(req.params.id, req.body.userId);
    audit(req, { action: 'workspace.transfer', targetType: 'workspace', targetId: req.params.id, details: req.body });
    ok(res);
  },
  deleteWorkspace: async (req: Request, res: Response) => {
    await adminWorkspacesService.remove(req.params.id);
    audit(req, { action: 'workspace.delete', targetType: 'workspace', targetId: req.params.id });
    await refreshOverview();
    ok(res);
  },

  /* ---------- staff & roles ---------- */
  permissions: (_req: Request, res: Response) => res.json(adminStaffService.permissions()),
  listStaff: async (_req: Request, res: Response) => res.json(await adminStaffService.listStaff()),
  promoteStaff: async (req: Request, res: Response) => {
    const user = await adminStaffService.promote(actor(req), req.body);
    audit(req, { action: 'staff.promote', targetType: 'user', targetId: user.id, details: { role: req.body.role, staffRoleId: req.body.staffRoleId } });
    res.json(user);
  },
  setStaffRole: async (req: Request, res: Response) => {
    const user = await adminStaffService.setStaffRole(req.params.userId, req.body.staffRoleId ?? null);
    audit(req, { action: 'staff.role', targetType: 'user', targetId: req.params.userId, details: req.body });
    res.json(user);
  },
  demoteStaff: async (req: Request, res: Response) => {
    await adminStaffService.demote(actor(req), req.params.userId);
    audit(req, { action: 'staff.demote', targetType: 'user', targetId: req.params.userId });
    ok(res);
  },
  listRoles: async (_req: Request, res: Response) => res.json(await adminStaffService.listRoles()),
  createRole: async (req: Request, res: Response) => {
    const role = await adminStaffService.createRole(req.body);
    audit(req, { action: 'role.create', targetType: 'role', targetId: role.id, details: req.body });
    res.json(role);
  },
  duplicateRole: async (req: Request, res: Response) => {
    const role = await adminStaffService.duplicateRole(req.params.id);
    audit(req, { action: 'role.duplicate', targetType: 'role', targetId: role.id, details: { from: req.params.id } });
    res.json(role);
  },
  updateRole: async (req: Request, res: Response) => {
    const role = await adminStaffService.updateRole(req.params.id, req.body);
    audit(req, { action: 'role.update', targetType: 'role', targetId: role.id, details: req.body });
    res.json(role);
  },
  deleteRole: async (req: Request, res: Response) => {
    const role = await adminStaffService.removeRole(req.params.id);
    audit(req, { action: 'role.delete', targetType: 'role', targetId: role.id, details: { name: role.name } });
    ok(res);
  },

  /* ---------- files ---------- */
  listFiles: async (req: Request, res: Response) => res.json(await adminFilesService.list(fileQuerySchema.parse(req.query))),
  deleteFile: async (req: Request, res: Response) => {
    const file = await adminFilesService.remove(req.params.id);
    audit(req, { action: 'file.delete', targetType: 'file', targetId: file.id, details: { name: file.originalName, userId: file.userId, size: file.size } });
    ok(res);
  },

  /* ---------- audit & settings ---------- */
  listAudit: async (req: Request, res: Response) => res.json(await adminAuditService.list(auditQuerySchema.parse(req.query))),
  getSettings: async (_req: Request, res: Response) => res.json(await platformService.settings()),
  updateSettings: async (req: Request, res: Response) => {
    const settings = await platformService.update(req.body);
    audit(req, { action: 'settings.update', targetType: 'platform', details: req.body });
    res.json(settings);
  },
};
