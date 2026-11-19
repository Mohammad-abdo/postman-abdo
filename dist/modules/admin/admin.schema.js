"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.intOrUndefined = exports.updateRoleSchema = exports.roleSchema = exports.promoteStaffSchema = exports.transferOwnershipSchema = exports.updateWorkspaceSchema = exports.settingsSchema = exports.defaultLimitsSchema = exports.limitsSchema = exports.updateUserSchema = exports.reportQuerySchema = exports.fileQuerySchema = exports.auditQuerySchema = exports.userListQuerySchema = exports.listQuerySchema = void 0;
const zod_1 = require("zod");
const permissions_1 = require("../../core/auth/permissions");
const intOrUndefined = zod_1.z.coerce.number().int().min(0).optional();
exports.intOrUndefined = intOrUndefined;
exports.listQuerySchema = zod_1.z.object({
    q: zod_1.z.string().trim().optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    pageSize: zod_1.z.coerce.number().int().min(1).max(200).default(25),
    sort: zod_1.z.string().optional(),
    order: zod_1.z.enum(['asc', 'desc']).default('desc'),
});
exports.userListQuerySchema = exports.listQuerySchema.extend({
    role: zod_1.z.enum(['user', 'staff', 'admin']).optional(),
    status: zod_1.z.enum(['active', 'suspended']).optional(),
});
exports.auditQuerySchema = exports.listQuerySchema.extend({
    action: zod_1.z.string().optional(),
    actorId: zod_1.z.string().optional(),
    targetType: zod_1.z.string().optional(),
    targetId: zod_1.z.string().optional(),
});
exports.fileQuerySchema = exports.listQuerySchema.extend({ userId: zod_1.z.string().optional() });
exports.reportQuerySchema = zod_1.z.object({
    days: zod_1.z.coerce.number().int().min(1).max(365).default(30),
});
exports.updateUserSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    email: zod_1.z.string().trim().toLowerCase().email().optional(),
    role: zod_1.z.enum(['user', 'staff', 'admin']).optional(),
    staffRoleId: zod_1.z.string().nullable().optional(),
    status: zod_1.z.enum(['active', 'suspended']).optional(),
    bio: zod_1.z.string().nullable().optional(),
    company: zod_1.z.string().nullable().optional(),
    jobTitle: zod_1.z.string().nullable().optional(),
    location: zod_1.z.string().nullable().optional(),
    website: zod_1.z.string().nullable().optional(),
});
/** Every limit is optional; `null` removes the user's override so the platform default applies. */
exports.limitsSchema = zod_1.z.object({
    maxWorkspaces: zod_1.z.number().int().min(0).nullable().optional(),
    maxMembersPerWorkspace: zod_1.z.number().int().min(1).nullable().optional(),
    maxProjectsPerWorkspace: zod_1.z.number().int().min(0).nullable().optional(),
    maxCollectionsPerWorkspace: zod_1.z.number().int().min(0).nullable().optional(),
    maxRequestsPerDay: zod_1.z.number().int().min(0).nullable().optional(),
    maxUploadMb: zod_1.z.number().min(0).nullable().optional(),
    maxStorageMb: zod_1.z.number().min(0).nullable().optional(),
    maxMonitors: zod_1.z.number().int().min(0).nullable().optional(),
    maxMockServers: zod_1.z.number().int().min(0).nullable().optional(),
});
exports.defaultLimitsSchema = zod_1.z.object({
    maxWorkspaces: zod_1.z.number().int().min(0),
    maxMembersPerWorkspace: zod_1.z.number().int().min(1),
    maxProjectsPerWorkspace: zod_1.z.number().int().min(0),
    maxCollectionsPerWorkspace: zod_1.z.number().int().min(0),
    maxRequestsPerDay: zod_1.z.number().int().min(0),
    maxUploadMb: zod_1.z.number().min(0),
    maxStorageMb: zod_1.z.number().min(0),
    maxMonitors: zod_1.z.number().int().min(0),
    maxMockServers: zod_1.z.number().int().min(0),
});
exports.settingsSchema = zod_1.z.object({
    registrationOpen: zod_1.z.boolean().optional(),
    maintenanceMode: zod_1.z.boolean().optional(),
    announcement: zod_1.z.string().max(500).optional(),
    defaultLimits: exports.defaultLimitsSchema.partial().optional(),
});
exports.updateWorkspaceSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    description: zod_1.z.string().nullable().optional(),
    memberLimit: zod_1.z.number().int().min(1).nullable().optional(),
});
exports.transferOwnershipSchema = zod_1.z.object({ userId: zod_1.z.string().min(1) });
exports.promoteStaffSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email(),
    staffRoleId: zod_1.z.string().nullable().optional(),
    role: zod_1.z.enum(['staff', 'admin']).default('staff'),
});
const permissionEnum = zod_1.z.enum(permissions_1.ALL_PERMISSIONS);
exports.roleSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60),
    description: zod_1.z.string().max(500).nullable().optional(),
    permissions: zod_1.z.array(permissionEnum).default([]),
});
exports.updateRoleSchema = exports.roleSchema.partial();
