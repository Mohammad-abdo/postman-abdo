import { z } from 'zod';
import { authSchema, bodySchema, id, keyValueSchema, scriptSchema } from '../../shared/validation/common.schema';

export const requestFieldsSchema = z.object({
  name: z.string().trim().min(1),
  type: z.enum(['http', 'websocket']),
  method: z.string().trim().min(1).transform((m) => m.toUpperCase()),
  url: z.string(),
  params: z.array(keyValueSchema),
  pathVariables: z.array(keyValueSchema),
  headers: z.array(keyValueSchema),
  body: bodySchema,
  auth: authSchema,
  preRequestScript: scriptSchema,
  testScript: scriptSchema,
  settings: z.record(z.unknown()),
  messages: z.array(z.unknown()),
  description: z.string().nullable(),
});

export const createRequestSchema = requestFieldsSchema.partial().extend({
  collectionId: id,
  folderId: id.nullable().optional(),
});

export const updateRequestSchema = requestFieldsSchema.partial();

export const moveRequestSchema = z.object({
  collectionId: id,
  folderId: id.nullable().default(null),
  index: z.number().int().min(0).default(0),
});

export type CreateRequestInput = z.infer<typeof createRequestSchema>;
export type UpdateRequestInput = z.infer<typeof updateRequestSchema>;
export type MoveRequestInput = z.infer<typeof moveRequestSchema>;
