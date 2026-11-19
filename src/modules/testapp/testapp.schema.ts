import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

const scenario = z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']);

export const analyzeSchema = z.object({ collectionId: id });

export const createTestAppSchema = z.object({
  collectionId: id,
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.number().int().min(1).max(2_000_000_000).default(1),
});

export const updateTestAppSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  settings: z.object({ validation: z.enum(['lenient', 'strict']).optional(), rows: z.number().int().min(0).max(200).optional() }).optional(),
});

export const overrideSchema = z.object({
  decision: z
    .object({ exclude: z.string().max(200).optional(), include: z.boolean().optional(), title: z.string().trim().min(1).max(120).optional() })
    .refine((d) => Object.keys(d).length > 0, 'Empty decision'),
});

export const regenerateSchema = z.object({ preview: z.boolean().default(false), seed: z.number().int().min(1).max(2_000_000_000).optional() });

export const createSessionSchema = z.object({ versionId: id.optional(), seed: z.number().int().min(1).max(2_000_000_000).optional() });

export const invokeSchema = z
  .object({
    actionId: z.string().max(200).optional(),
    endpoint: z.string().max(500).optional(),
    values: z.record(z.any()).default({}),
    pathParams: z.record(z.string()).optional(),
    query: z.record(z.string()).optional(),
    body: z.any().optional(),
    scenario: scenario.optional(),
  })
  .refine((v) => v.actionId || v.endpoint, 'actionId or endpoint is required');

export const resetSchema = z.object({ seed: z.number().int().min(1).max(2_000_000_000).optional() });
export const runSchema = z.object({ mode: z.literal('mock').default('mock') });

export type InvokeInput = z.infer<typeof invokeSchema>;
