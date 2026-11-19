"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.editMessageSchema = exports.reactSchema = exports.sendMessageSchema = exports.attachmentInputSchema = exports.addConversationMembersSchema = exports.updateConversationSchema = exports.openConversationSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.openConversationSchema = zod_1.z.discriminatedUnion('type', [
    zod_1.z.object({ type: zod_1.z.literal('direct'), workspaceId: common_schema_1.id, userId: common_schema_1.id }),
    zod_1.z.object({
        type: zod_1.z.literal('channel'),
        workspaceId: common_schema_1.id,
        name: zod_1.z.string().trim().min(1).max(60),
        memberIds: zod_1.z.array(common_schema_1.id).default([]),
    }),
]);
exports.updateConversationSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(60).optional(),
    muted: zod_1.z.boolean().optional(),
});
exports.addConversationMembersSchema = zod_1.z.object({ userIds: zod_1.z.array(common_schema_1.id).min(1) });
/** A file previously uploaded through POST /chat/upload; the server fills in name, type and size. */
exports.attachmentInputSchema = zod_1.z.object({
    file: zod_1.z.string().min(1).max(300),
    voice: zod_1.z.boolean().optional(),
    duration: zod_1.z.number().min(0).max(36000).optional(),
    width: zod_1.z.number().int().positive().max(20000).optional(),
    height: zod_1.z.number().int().positive().max(20000).optional(),
});
exports.sendMessageSchema = zod_1.z
    .object({
    /** Client-generated id makes retries/offline replays idempotent. */
    id: zod_1.z.string().uuid().optional(),
    body: zod_1.z.string().trim().max(8000).default(''),
    attachments: zod_1.z.array(exports.attachmentInputSchema).max(10).default([]),
})
    .refine((m) => m.body.length > 0 || m.attachments.length > 0, { message: 'Message cannot be empty' });
exports.reactSchema = zod_1.z.object({ emoji: zod_1.z.string().min(1).max(16) });
exports.editMessageSchema = zod_1.z.object({ body: zod_1.z.string().trim().min(1).max(8000) });
