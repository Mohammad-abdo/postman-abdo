"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCollectionSchema = exports.sendRequestSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.sendRequestSchema = zod_1.z.object({
    workspaceId: common_schema_1.id,
    environmentId: common_schema_1.id.nullable().optional(),
    /** The (possibly unsaved) request as edited in the tab. */
    request: zod_1.z
        .object({
        id: zod_1.z.string().optional(),
        collectionId: zod_1.z.string().nullable().optional(),
        folderId: zod_1.z.string().nullable().optional(),
        name: zod_1.z.string().default('Untitled Request'),
        method: zod_1.z.string().default('GET'),
        url: zod_1.z.string().default(''),
        settings: zod_1.z.record(zod_1.z.unknown()).optional(),
    })
        .passthrough(),
});
exports.runCollectionSchema = zod_1.z.object({
    workspaceId: common_schema_1.id,
    collectionId: common_schema_1.id,
    folderId: common_schema_1.id.nullable().optional(),
    requestIds: zod_1.z.array(zod_1.z.string()).optional(),
    environmentId: common_schema_1.id.nullable().optional(),
    iterations: zod_1.z.number().int().min(1).max(10000).default(1),
    delay: zod_1.z.number().int().min(0).default(0),
    data: zod_1.z.array(zod_1.z.record(zod_1.z.unknown())).optional(),
    persistVariables: zod_1.z.boolean().default(true),
    saveCookies: zod_1.z.boolean().default(true),
    disableCookies: zod_1.z.boolean().default(false),
    bail: zod_1.z.boolean().default(false),
    persistResponses: zod_1.z.boolean().default(false),
});
