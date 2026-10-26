import cron from 'node-cron';
import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

const cronExpression = z.string().refine((v) => cron.validate(v), 'Invalid schedule');

export const createMonitorSchema = z.object({
  workspaceId: id,
  collectionId: id,
  environmentId: id.nullable().optional(),
  name: z.string().trim().min(1).default('New Monitor'),
  cron: cronExpression.default('0 * * * *'),
});

export const updateMonitorSchema = z.object({
  name: z.string().trim().min(1).optional(),
  environmentId: id.nullable().optional(),
  cron: cronExpression.optional(),
  enabled: z.boolean().optional(),
});

export type CreateMonitorInput = z.infer<typeof createMonitorSchema>;
export type UpdateMonitorInput = z.infer<typeof updateMonitorSchema>;
