import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const heartbeatSchema = z.object({
  deviceId: z.string().uuid(),
  platform: z.enum(['web', 'desktop']).default('web'),
  appVersion: z.string().max(40).optional(),
  pendingOps: z.number().int().min(0).default(0),
  lastSyncAt: z.string().datetime().nullable().optional(),
});

/** A request executed on a device (desktop app), added to the account history. */
export const historyEntrySchema = z.object({
  id: z.string().uuid(),
  workspaceId: id,
  method: z.string().min(1).max(20),
  url: z.string().max(10_000),
  name: z.string().nullable().optional(),
  request: z.record(z.unknown()),
  response: z.record(z.unknown()).nullable().optional(),
  createdAt: z.string().datetime().optional(),
});

export type HeartbeatInput = z.infer<typeof heartbeatSchema>;
export type HistoryEntryInput = z.infer<typeof historyEntrySchema>;
