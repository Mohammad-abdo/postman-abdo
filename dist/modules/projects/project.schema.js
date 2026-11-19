"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProjectMemberSchema = exports.addProjectMembersSchema = exports.updateProjectSchema = exports.createProjectSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
const color = zod_1.z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Color must be a hex value like #FF6C37');
exports.createProjectSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    workspaceId: common_schema_1.id,
    name: zod_1.z.string().trim().min(1).max(120),
    description: zod_1.z.string().max(5000).optional(),
    color: color.default('#FF6C37'),
    /** Workspace members to add right away. */
    memberIds: zod_1.z.array(common_schema_1.id).default([]),
    /** Add every member of the workspace ("Add whole team"). */
    addAllMembers: zod_1.z.boolean().default(false),
    /** Create an empty collection inside the project. */
    initialCollection: zod_1.z.string().trim().max(120).optional(),
    /**
     * Exact variables per stage (from the guided setup). When given, they replace the default `baseUrl` variable.
     * e.g. [{ stage: 'production', variables: [{ key: 'base_url', value: 'https://api.example.com' }] }]
     */
    environments: zod_1.z
        .array(zod_1.z.object({
        stage: zod_1.z.enum(['local', 'development', 'production']),
        variables: zod_1.z.array(zod_1.z.object({ key: zod_1.z.string().trim().min(1), value: zod_1.z.string().default(''), type: zod_1.z.enum(['default', 'secret']).default('default') })),
    }))
        .optional(),
    /** Existing collections (e.g. just imported) to put in the project. */
    collectionIds: zod_1.z.array(common_schema_1.id).default([]),
    /** Base URLs for the Local / Development / Production environments. */
    baseUrls: zod_1.z
        .object({ local: zod_1.z.string().optional(), development: zod_1.z.string().optional(), production: zod_1.z.string().optional() })
        .default({}),
});
exports.updateProjectSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120).optional(),
    description: zod_1.z.string().max(5000).nullable().optional(),
    color: color.optional(),
});
/** Specific people (`userIds`, or a single `userId`) or the whole workspace team (`all: true`). */
exports.addProjectMembersSchema = zod_1.z
    .object({
    userId: common_schema_1.id.optional(),
    userIds: zod_1.z.array(common_schema_1.id).default([]),
    all: zod_1.z.boolean().default(false),
    role: zod_1.z.enum(['admin', 'editor', 'viewer']).default('editor'),
})
    .transform(({ userId, ...rest }) => ({ ...rest, userIds: userId ? [...rest.userIds, userId] : rest.userIds }))
    .refine((v) => v.all || v.userIds.length > 0, 'Pick at least one member or add the whole team');
exports.updateProjectMemberSchema = zod_1.z.object({
    role: zod_1.z.enum(['admin', 'editor', 'viewer']),
});
