import { z } from 'zod';
import { id, variableSchema } from '../../shared/validation/common.schema';

export const createEnvironmentSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: id,
  projectId: id.nullable().optional(),
  stage: z.enum(['local', 'development', 'production', 'custom']).default('custom'),
  name: z.string().trim().min(1).default('New Environment'),
  variables: z.array(variableSchema).default([]),
});

export const updateEnvironmentSchema = z.object({
  stage: z.enum(['local', 'development', 'production', 'custom']).optional(),
  name: z.string().trim().min(1).optional(),
  variables: z.array(variableSchema).optional(),
});

export type CreateEnvironmentInput = z.infer<typeof createEnvironmentSchema>;
export type UpdateEnvironmentInput = z.infer<typeof updateEnvironmentSchema>;
