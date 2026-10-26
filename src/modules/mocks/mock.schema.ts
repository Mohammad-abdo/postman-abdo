import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const createMockSchema = z.object({
  workspaceId: id,
  collectionId: id,
  environmentId: id.nullable().optional(),
  name: z.string().trim().min(1).default('New Mock Server'),
  delay: z.number().int().min(0).default(0),
  isPrivate: z.boolean().default(false),
});

export const updateMockSchema = z.object({
  name: z.string().trim().min(1).optional(),
  environmentId: id.nullable().optional(),
  delay: z.number().int().min(0).optional(),
  isPrivate: z.boolean().optional(),
});

export type CreateMockInput = z.infer<typeof createMockSchema>;
export type UpdateMockInput = z.infer<typeof updateMockSchema>;
