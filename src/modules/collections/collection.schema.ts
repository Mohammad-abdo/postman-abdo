import { z } from 'zod';
import { authSchema, id, scriptSchema, variableSchema } from '../../shared/validation/common.schema';

export const createCollectionSchema = z.object({
  id: z.string().uuid().optional(),
  workspaceId: id,
  projectId: id.nullable().optional(),
  name: z.string().trim().min(1).default('New Collection'),
  description: z.string().optional(),
});

export const updateCollectionSchema = z.object({
  projectId: id.nullable().optional(),
  name: z.string().trim().min(1).optional(),
  description: z.string().nullable().optional(),
  auth: authSchema.optional(),
  variables: z.array(variableSchema).optional(),
  preRequestScript: scriptSchema,
  testScript: scriptSchema,
});

export const positionSchema = z.object({ index: z.number().int().min(0) });

export type CreateCollectionInput = z.infer<typeof createCollectionSchema>;
export type UpdateCollectionInput = z.infer<typeof updateCollectionSchema>;
