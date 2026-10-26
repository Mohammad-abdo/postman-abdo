import { z } from 'zod';

export const id = z.string().min(1);

export const keyValueSchema = z
  .object({
    key: z.string().default(''),
    value: z.string().default(''),
    enabled: z.boolean().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export const variableSchema = keyValueSchema.extend({
  currentValue: z.string().optional(),
  type: z.enum(['default', 'secret']).optional(),
});

export const authSchema = z.object({ type: z.string() }).passthrough();

export const bodySchema = z
  .object({
    mode: z.enum(['none', 'raw', 'urlencoded', 'formdata', 'file', 'graphql']),
  })
  .passthrough();

export const scriptSchema = z.string().nullable().optional();
