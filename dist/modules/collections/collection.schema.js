"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.positionSchema = exports.updateCollectionSchema = exports.createCollectionSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.createCollectionSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    workspaceId: common_schema_1.id,
    projectId: common_schema_1.id.nullable().optional(),
    name: zod_1.z.string().trim().min(1).default('New Collection'),
    description: zod_1.z.string().optional(),
});
exports.updateCollectionSchema = zod_1.z.object({
    projectId: common_schema_1.id.nullable().optional(),
    name: zod_1.z.string().trim().min(1).optional(),
    description: zod_1.z.string().nullable().optional(),
    auth: common_schema_1.authSchema.optional(),
    variables: zod_1.z.array(common_schema_1.variableSchema).optional(),
    preRequestScript: common_schema_1.scriptSchema,
    testScript: common_schema_1.scriptSchema,
});
exports.positionSchema = zod_1.z.object({ index: zod_1.z.number().int().min(0) });
