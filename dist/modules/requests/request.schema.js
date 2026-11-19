"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveRequestSchema = exports.updateRequestSchema = exports.createRequestSchema = exports.requestFieldsSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.requestFieldsSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1),
    type: zod_1.z.enum(['http', 'websocket']),
    method: zod_1.z.string().trim().min(1).transform((m) => m.toUpperCase()),
    url: zod_1.z.string(),
    params: zod_1.z.array(common_schema_1.keyValueSchema),
    pathVariables: zod_1.z.array(common_schema_1.keyValueSchema),
    headers: zod_1.z.array(common_schema_1.keyValueSchema),
    body: common_schema_1.bodySchema,
    auth: common_schema_1.authSchema,
    preRequestScript: common_schema_1.scriptSchema,
    testScript: common_schema_1.scriptSchema,
    settings: zod_1.z.record(zod_1.z.unknown()),
    messages: zod_1.z.array(zod_1.z.unknown()),
    description: zod_1.z.string().nullable(),
});
exports.createRequestSchema = exports.requestFieldsSchema.partial().extend({
    id: zod_1.z.string().uuid().optional(),
    collectionId: common_schema_1.id,
    folderId: common_schema_1.id.nullable().optional(),
});
exports.updateRequestSchema = exports.requestFieldsSchema.partial();
exports.moveRequestSchema = zod_1.z.object({
    collectionId: common_schema_1.id,
    folderId: common_schema_1.id.nullable().default(null),
    index: zod_1.z.number().int().min(0).default(0),
});
