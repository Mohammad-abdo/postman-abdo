import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

const scenario = z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']);

export const analyzeSchema = z.object({ collectionId: id });

export const createTestAppSchema = z.object({
  collectionId: id,
  name: z.string().trim().min(1).max(120).optional(),
  seed: z.number().int().min(1).max(2_000_000_000).default(1),
});

const realSchema = z.object({
  enabled: z.boolean(),
  allowedHosts: z.array(z.string().trim().min(3).max(255).regex(/^[A-Za-z0-9.*-]+$/, 'Use a host name like api.example.com or .example.com')).max(20),
  baseUrl: z.union([z.string().url().max(500), z.literal('')]).optional(),
  environmentId: id.nullable().optional(),
  runScripts: z.boolean().optional(),
  allowUnsafe: z.boolean().optional(),
});

export const customTestSchema = z.object({
  name: z.string().trim().min(1).max(200),
  endpoint: z.string().min(1).max(500),
  pathParams: z.record(z.string().max(200)).optional(),
  query: z.record(z.string().max(500)).optional(),
  body: z.any().optional(),
  scenario: scenario.optional(),
  noAuth: z.boolean().optional(),
  expectStatus: z.number().int().min(100).max(599),
  expectBodyKeys: z.array(z.string().max(200)).max(30).optional(),
  origin: z.enum(['user', 'ai']).optional(),
  reason: z.string().max(400).optional(),
});

export const updateTestAppSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  settings: z
    .object({
      validation: z.enum(['lenient', 'strict']).optional(),
      rows: z.number().int().min(0).max(200).optional(),
      real: realSchema.optional(),
      customTests: z.array(customTestSchema).max(100).optional(),
    })
    .strict()
    .optional(),
});

export const rulesSchema = z.object({ custom: z.array(z.any()).max(50).default([]), disabled: z.array(z.string().max(60)).max(60).default([]) });
export const realInvokeSchema = z.object({ actionId: z.string().min(1).max(200), values: z.record(z.any()).default({}), confirmUnsafe: z.boolean().optional(), confirmProduction: z.boolean().optional() });

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
export const runSchema = z.object({ mode: z.enum(['mock', 'real', 'compare']).default('mock'), confirmUnsafe: z.boolean().optional(), confirmProduction: z.boolean().optional() });

export type InvokeInput = z.infer<typeof invokeSchema>;
