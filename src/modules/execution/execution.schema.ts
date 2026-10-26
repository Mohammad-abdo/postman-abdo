import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const sendRequestSchema = z.object({
  workspaceId: id,
  environmentId: id.nullable().optional(),
  /** The (possibly unsaved) request as edited in the tab. */
  request: z
    .object({
      id: z.string().optional(),
      collectionId: z.string().nullable().optional(),
      folderId: z.string().nullable().optional(),
      name: z.string().default('Untitled Request'),
      method: z.string().default('GET'),
      url: z.string().default(''),
      settings: z.record(z.unknown()).optional(),
    })
    .passthrough(),
});

export const runCollectionSchema = z.object({
  workspaceId: id,
  collectionId: id,
  folderId: id.nullable().optional(),
  requestIds: z.array(z.string()).optional(),
  environmentId: id.nullable().optional(),
  iterations: z.number().int().min(1).max(10000).default(1),
  delay: z.number().int().min(0).default(0),
  data: z.array(z.record(z.unknown())).optional(),
  persistVariables: z.boolean().default(true),
  saveCookies: z.boolean().default(true),
  disableCookies: z.boolean().default(false),
  bail: z.boolean().default(false),
  persistResponses: z.boolean().default(false),
});

export type SendRequestInput = z.infer<typeof sendRequestSchema>;
export type RunCollectionInput = z.infer<typeof runCollectionSchema>;
