import { z } from 'zod';
import { id, keyValueSchema } from '../../shared/validation/common.schema';

const exampleFields = z.object({
  name: z.string().trim().min(1),
  request: z.record(z.unknown()).nullable(),
  code: z.number().int().min(100).max(599),
  status: z.string(),
  headers: z.array(keyValueSchema),
  body: z.string().nullable(),
  language: z.string(),
});

export const createExampleSchema = exampleFields.partial().extend({ requestId: id });
export const updateExampleSchema = exampleFields.partial();

export type CreateExampleInput = z.infer<typeof createExampleSchema>;
export type UpdateExampleInput = z.infer<typeof updateExampleSchema>;
