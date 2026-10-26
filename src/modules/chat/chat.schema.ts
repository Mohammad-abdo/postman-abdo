import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const openConversationSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('direct'), workspaceId: id, userId: id }),
  z.object({
    type: z.literal('channel'),
    workspaceId: id,
    name: z.string().trim().min(1).max(60),
    memberIds: z.array(id).default([]),
  }),
]);

export const updateConversationSchema = z.object({
  name: z.string().trim().min(1).max(60).optional(),
  muted: z.boolean().optional(),
});

export const addConversationMembersSchema = z.object({ userIds: z.array(id).min(1) });

export const sendMessageSchema = z.object({
  /** Client-generated id makes retries/offline replays idempotent. */
  id: z.string().uuid().optional(),
  body: z.string().trim().min(1).max(8000),
});

export const editMessageSchema = z.object({ body: z.string().trim().min(1).max(8000) });

export type OpenConversationInput = z.infer<typeof openConversationSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
