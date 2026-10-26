import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #FF6C37');

export const createProjectSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: id,
  name: z.string().trim().min(1).max(120),
  description: z.string().max(5000).optional(),
  color: color.default('#FF6C37'),
  /** Workspace members to add right away. */
  memberIds: z.array(id).default([]),
  /** Add every member of the workspace ("Add whole team"). */
  addAllMembers: z.boolean().default(false),
  /** Create an empty collection inside the project. */
  initialCollection: z.string().trim().max(120).optional(),
  /** Base URLs for the Local / Development / Production environments. */
  baseUrls: z
    .object({ local: z.string().optional(), development: z.string().optional(), production: z.string().optional() })
    .default({}),
});

export const updateProjectSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).nullable().optional(),
  color: color.optional(),
});

/** Specific people (`userIds`, or a single `userId`) or the whole workspace team (`all: true`). */
export const addProjectMembersSchema = z
  .object({
    userId: id.optional(),
    userIds: z.array(id).default([]),
    all: z.boolean().default(false),
    role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
  })
  .transform(({ userId, ...rest }) => ({ ...rest, userIds: userId ? [...rest.userIds, userId] : rest.userIds }))
  .refine((v) => v.all || v.userIds.length > 0, 'Pick at least one member or add the whole team');

export const updateProjectMemberSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMembersInput = z.infer<typeof addProjectMembersSchema>;
