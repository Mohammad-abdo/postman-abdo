import { z } from 'zod';
import { authSchema, id, scriptSchema } from '../../shared/validation/common.schema';

export const createFolderSchema = z.object({
  collectionId: id,
  parentId: id.nullable().optional(),
  name: z.string().trim().min(1).default('New Folder'),
});

export const updateFolderSchema = z.object({
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  auth: authSchema.optional(),
  preRequestScript: scriptSchema,
  testScript: scriptSchema,
});

export const moveFolderSchema = z.object({
  collectionId: id,
  parentId: id.nullable().default(null),
  index: z.number().int().min(0).default(0),
});

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type MoveFolderInput = z.infer<typeof moveFolderSchema>;
