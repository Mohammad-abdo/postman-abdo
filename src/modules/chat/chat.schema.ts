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

/** A file previously uploaded through POST /chat/upload; the server fills in name, type and size. */
export const attachmentInputSchema = z.object({
  file: z.string().min(1).max(300),
  voice: z.boolean().optional(),
  duration: z.number().min(0).max(36000).optional(),
  width: z.number().int().positive().max(20000).optional(),
  height: z.number().int().positive().max(20000).optional(),
});

export const sendMessageSchema = z
  .object({
    /** Client-generated id makes retries/offline replays idempotent. */
    id: z.string().uuid().optional(),
    body: z.string().trim().max(8000).default(''),
    attachments: z.array(attachmentInputSchema).max(10).default([]),
  })
  .refine((m) => m.body.length > 0 || m.attachments.length > 0, { message: 'Message cannot be empty' });

export const reactSchema = z.object({ emoji: z.string().min(1).max(16) });

export const editMessageSchema = z.object({ body: z.string().trim().min(1).max(8000) });

export type OpenConversationInput = z.infer<typeof openConversationSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type SendMessageInput = z.infer<typeof sendMessageSchema>;
