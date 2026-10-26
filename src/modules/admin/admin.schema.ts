import { z } from 'zod';
import { ALL_PERMISSIONS } from '../../core/auth/permissions';

const intOrUndefined = z.coerce.number().int().min(0).optional();

export const listQuerySchema = z.object({
  q: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(25),
  sort: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export const userListQuerySchema = listQuerySchema.extend({
  role: z.enum(['user', 'staff', 'admin']).optional(),
  status: z.enum(['active', 'suspended']).optional(),
});

export const auditQuerySchema = listQuerySchema.extend({
  action: z.string().optional(),
  actorId: z.string().optional(),
  targetType: z.string().optional(),
  targetId: z.string().optional(),
});

export const fileQuerySchema = listQuerySchema.extend({ userId: z.string().optional() });

export const reportQuerySchema = z.object({
  days: z.coerce.number().int().min(1).max(365).default(30),
});

export const updateUserSchema = z.object({
  name: z.string().trim().min(1).optional(),
  email: z.string().trim().toLowerCase().email().optional(),
  role: z.enum(['user', 'staff', 'admin']).optional(),
  staffRoleId: z.string().nullable().optional(),
  status: z.enum(['active', 'suspended']).optional(),
  bio: z.string().nullable().optional(),
  company: z.string().nullable().optional(),
  jobTitle: z.string().nullable().optional(),
  location: z.string().nullable().optional(),
  website: z.string().nullable().optional(),
});

/** Every limit is optional; `null` removes the user's override so the platform default applies. */
export const limitsSchema = z.object({
  maxWorkspaces: z.number().int().min(0).nullable().optional(),
  maxMembersPerWorkspace: z.number().int().min(1).nullable().optional(),
  maxProjectsPerWorkspace: z.number().int().min(0).nullable().optional(),
  maxCollectionsPerWorkspace: z.number().int().min(0).nullable().optional(),
  maxRequestsPerDay: z.number().int().min(0).nullable().optional(),
  maxUploadMb: z.number().min(0).nullable().optional(),
  maxStorageMb: z.number().min(0).nullable().optional(),
  maxMonitors: z.number().int().min(0).nullable().optional(),
  maxMockServers: z.number().int().min(0).nullable().optional(),
});

export const defaultLimitsSchema = z.object({
  maxWorkspaces: z.number().int().min(0),
  maxMembersPerWorkspace: z.number().int().min(1),
  maxProjectsPerWorkspace: z.number().int().min(0),
  maxCollectionsPerWorkspace: z.number().int().min(0),
  maxRequestsPerDay: z.number().int().min(0),
  maxUploadMb: z.number().min(0),
  maxStorageMb: z.number().min(0),
  maxMonitors: z.number().int().min(0),
  maxMockServers: z.number().int().min(0),
});

export const settingsSchema = z.object({
  registrationOpen: z.boolean().optional(),
  maintenanceMode: z.boolean().optional(),
  announcement: z.string().max(500).optional(),
  defaultLimits: defaultLimitsSchema.partial().optional(),
});

export const updateWorkspaceSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  memberLimit: z.number().int().min(1).nullable().optional(),
});

export const transferOwnershipSchema = z.object({ userId: z.string().min(1) });

export const promoteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  staffRoleId: z.string().nullable().optional(),
  role: z.enum(['staff', 'admin']).default('staff'),
});

const permissionEnum = z.enum(ALL_PERMISSIONS as [string, ...string[]]);

export const roleSchema = z.object({
  name: z.string().trim().min(1).max(60),
  description: z.string().max(500).nullable().optional(),
  permissions: z.array(permissionEnum).default([]),
});

export const updateRoleSchema = roleSchema.partial();

export type UserListQuery = z.infer<typeof userListQuerySchema>;
export type AuditQuery = z.infer<typeof auditQuerySchema>;
export type FileQuery = z.infer<typeof fileQuerySchema>;
export type ListQuery = z.infer<typeof listQuerySchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type LimitsInput = z.infer<typeof limitsSchema>;
export type SettingsInput = z.infer<typeof settingsSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type PromoteStaffInput = z.infer<typeof promoteStaffSchema>;
export type RoleInput = z.infer<typeof roleSchema>;

export { intOrUndefined };
