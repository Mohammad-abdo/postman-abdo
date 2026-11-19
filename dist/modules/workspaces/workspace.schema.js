"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.memberLimitSchema = exports.updateMemberSchema = exports.addMemberSchema = exports.updateWorkspaceSchema = exports.createWorkspaceSchema = void 0;
const zod_1 = require("zod");
exports.createWorkspaceSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    name: zod_1.z.string().trim().min(1).default('Untitled Workspace'),
    description: zod_1.z.string().optional(),
    type: zod_1.z.enum(['personal', 'team']).default('personal'),
});
exports.updateWorkspaceSchema = exports.createWorkspaceSchema.omit({ id: true }).partial();
exports.addMemberSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase().email(),
    role: zod_1.z.enum(['admin', 'editor', 'viewer']).default('editor'),
});
exports.updateMemberSchema = zod_1.z.object({
    role: zod_1.z.enum(['admin', 'editor', 'viewer']),
});
exports.memberLimitSchema = zod_1.z.object({
    memberLimit: zod_1.z.number().int().min(1).nullable(),
});
