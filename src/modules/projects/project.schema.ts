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

export const addProjectMemberSchema = z.object({
  userId: id,
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
});

export const updateProjectMemberSchema = z.object({
  role: z.enum(['admin', 'editor', 'viewer']),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
export type AddProjectMemberInput = z.infer<typeof addProjectMemberSchema>;
