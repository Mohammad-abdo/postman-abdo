"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminController = void 0;
const audit_service_1 = require("../../core/audit/audit.service");
const cache_service_1 = require("../../core/cache/cache.service");
const platform_service_1 = require("../platform/platform.service");
const admin_schema_1 = require("./admin.schema");
const admin_audit_service_1 = require("./services/admin-audit.service");
const admin_files_service_1 = require("./services/admin-files.service");
const admin_reports_service_1 = require("./services/admin-reports.service");
const admin_staff_service_1 = require("./services/admin-staff.service");
const admin_users_service_1 = require("./services/admin-users.service");
const admin_workspaces_service_1 = require("./services/admin-workspaces.service");
const actor = (req) => req.auth;
const ok = (res) => res.json({ ok: true });
const refreshOverview = () => cache_service_1.cache.invalidate(cache_service_1.cacheKeys.adminOverview());
exports.adminController = {
    /* ---------- dashboard ---------- */
    overview: async (_req, res) => res.json(await admin_reports_service_1.adminReportsService.overview()),
    reports: async (req, res) => res.json(await admin_reports_service_1.adminReportsService.reports(admin_schema_1.reportQuerySchema.parse(req.query).days)),
    /* ---------- users ---------- */
    listUsers: async (req, res) => res.json(await admin_users_service_1.adminUsersService.list(admin_schema_1.userListQuerySchema.parse(req.query))),
    getUser: async (req, res) => res.json(await admin_users_service_1.adminUsersService.detail(req.params.id)),
    updateUser: async (req, res) => {
        const user = await admin_users_service_1.adminUsersService.update(actor(req), req.params.id, req.body);
        (0, audit_service_1.audit)(req, { action: 'user.update', targetType: 'user', targetId: req.params.id, details: req.body });
        res.json(user);
    },
    suspendUser: async (req, res) => {
        const user = await admin_users_service_1.adminUsersService.setStatus(actor(req), req.params.id, 'suspended');
        (0, audit_service_1.audit)(req, { action: 'user.suspend', targetType: 'user', targetId: req.params.id, details: { reason: req.body?.reason } });
        await refreshOverview();
        res.json(user);
    },
    reactivateUser: async (req, res) => {
        const user = await admin_users_service_1.adminUsersService.setStatus(actor(req), req.params.id, 'active');
        (0, audit_service_1.audit)(req, { action: 'user.reactivate', targetType: 'user', targetId: req.params.id });
        await refreshOverview();
        res.json(user);
    },
    forceLogout: async (req, res) => {
        await admin_users_service_1.adminUsersService.forceLogout(actor(req), req.params.id);
        (0, audit_service_1.audit)(req, { action: 'user.force_logout', targetType: 'user', targetId: req.params.id });
        ok(res);
    },
    resetPassword: async (req, res) => {
        const result = await admin_users_service_1.adminUsersService.resetPassword(actor(req), req.params.id);
        (0, audit_service_1.audit)(req, { action: 'user.reset_password', targetType: 'user', targetId: req.params.id });
        res.json(result);
    },
    setUserLimits: async (req, res) => {
        const limits = await admin_users_service_1.adminUsersService.setLimits(actor(req), req.params.id, req.body);
        (0, audit_service_1.audit)(req, { action: 'user.limits', targetType: 'user', targetId: req.params.id, details: req.body });
        res.json(limits);
    },
    deleteUser: async (req, res) => {
        const { email } = await admin_users_service_1.adminUsersService.remove(actor(req), req.params.id);
        (0, audit_service_1.audit)(req, { action: 'user.delete', targetType: 'user', targetId: req.params.id, details: { email } });
        await refreshOverview();
        ok(res);
    },
    /* ---------- workspaces ---------- */
    listWorkspaces: async (req, res) => res.json(await admin_workspaces_service_1.adminWorkspacesService.list(admin_schema_1.listQuerySchema.parse(req.query))),
    getWorkspace: async (req, res) => res.json(await admin_workspaces_service_1.adminWorkspacesService.detail(req.params.id)),
    updateWorkspace: async (req, res) => {
        const workspace = await admin_workspaces_service_1.adminWorkspacesService.update(req.params.id, req.body);
        (0, audit_service_1.audit)(req, { action: 'workspace.update', targetType: 'workspace', targetId: req.params.id, details: req.body });
        res.json(workspace);
    },
    removeWorkspaceMember: async (req, res) => {
        await admin_workspaces_service_1.adminWorkspacesService.removeMember(req.params.id, req.params.userId);
        (0, audit_service_1.audit)(req, { action: 'workspace.member_remove', targetType: 'workspace', targetId: req.params.id, details: { userId: req.params.userId } });
        ok(res);
    },
    transferWorkspace: async (req, res) => {
        await admin_workspaces_service_1.adminWorkspacesService.transferOwnership(req.params.id, req.body.userId);
        (0, audit_service_1.audit)(req, { action: 'workspace.transfer', targetType: 'workspace', targetId: req.params.id, details: req.body });
        ok(res);
    },
    deleteWorkspace: async (req, res) => {
        await admin_workspaces_service_1.adminWorkspacesService.remove(req.params.id);
        (0, audit_service_1.audit)(req, { action: 'workspace.delete', targetType: 'workspace', targetId: req.params.id });
        await refreshOverview();
        ok(res);
    },
    /* ---------- staff & roles ---------- */
    permissions: (_req, res) => res.json(admin_staff_service_1.adminStaffService.permissions()),
    listStaff: async (_req, res) => res.json(await admin_staff_service_1.adminStaffService.listStaff()),
    promoteStaff: async (req, res) => {
        const user = await admin_staff_service_1.adminStaffService.promote(actor(req), req.body);
        (0, audit_service_1.audit)(req, { action: 'staff.promote', targetType: 'user', targetId: user.id, details: { role: req.body.role, staffRoleId: req.body.staffRoleId } });
        res.json(user);
    },
    setStaffRole: async (req, res) => {
        const user = await admin_staff_service_1.adminStaffService.setStaffRole(req.params.userId, req.body.staffRoleId ?? null);
        (0, audit_service_1.audit)(req, { action: 'staff.role', targetType: 'user', targetId: req.params.userId, details: req.body });
        res.json(user);
    },
    demoteStaff: async (req, res) => {
        await admin_staff_service_1.adminStaffService.demote(actor(req), req.params.userId);
        (0, audit_service_1.audit)(req, { action: 'staff.demote', targetType: 'user', targetId: req.params.userId });
        ok(res);
    },
    listRoles: async (_req, res) => res.json(await admin_staff_service_1.adminStaffService.listRoles()),
    createRole: async (req, res) => {
        const role = await admin_staff_service_1.adminStaffService.createRole(req.body);
        (0, audit_service_1.audit)(req, { action: 'role.create', targetType: 'role', targetId: role.id, details: req.body });
        res.json(role);
    },
    duplicateRole: async (req, res) => {
        const role = await admin_staff_service_1.adminStaffService.duplicateRole(req.params.id);
        (0, audit_service_1.audit)(req, { action: 'role.duplicate', targetType: 'role', targetId: role.id, details: { from: req.params.id } });
        res.json(role);
    },
    updateRole: async (req, res) => {
        const role = await admin_staff_service_1.adminStaffService.updateRole(req.params.id, req.body);
        (0, audit_service_1.audit)(req, { action: 'role.update', targetType: 'role', targetId: role.id, details: req.body });
        res.json(role);
    },
    deleteRole: async (req, res) => {
        const role = await admin_staff_service_1.adminStaffService.removeRole(req.params.id);
        (0, audit_service_1.audit)(req, { action: 'role.delete', targetType: 'role', targetId: role.id, details: { name: role.name } });
        ok(res);
    },
    /* ---------- files ---------- */
    listFiles: async (req, res) => res.json(await admin_files_service_1.adminFilesService.list(admin_schema_1.fileQuerySchema.parse(req.query))),
    deleteFile: async (req, res) => {
        const file = await admin_files_service_1.adminFilesService.remove(req.params.id);
        (0, audit_service_1.audit)(req, { action: 'file.delete', targetType: 'file', targetId: file.id, details: { name: file.originalName, userId: file.userId, size: file.size } });
        ok(res);
    },
    /* ---------- audit & settings ---------- */
    listAudit: async (req, res) => res.json(await admin_audit_service_1.adminAuditService.list(admin_schema_1.auditQuerySchema.parse(req.query))),
    getSettings: async (_req, res) => res.json(await platform_service_1.platformService.settings()),
    updateSettings: async (req, res) => {
        const settings = await platform_service_1.platformService.update(req.body);
        (0, audit_service_1.audit)(req, { action: 'settings.update', targetType: 'platform', details: req.body });
        res.json(settings);
    },
};
