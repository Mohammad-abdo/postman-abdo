"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMockSchema = exports.createMockSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.createMockSchema = zod_1.z.object({
    workspaceId: common_schema_1.id,
    collectionId: common_schema_1.id,
    environmentId: common_schema_1.id.nullable().optional(),
    name: zod_1.z.string().trim().min(1).default('New Mock Server'),
    delay: zod_1.z.number().int().min(0).default(0),
    isPrivate: zod_1.z.boolean().default(false),
});
exports.updateMockSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    environmentId: common_schema_1.id.nullable().optional(),
    delay: zod_1.z.number().int().min(0).optional(),
    isPrivate: zod_1.z.boolean().optional(),
});
