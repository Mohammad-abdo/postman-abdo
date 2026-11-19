"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateEnvironmentSchema = exports.createEnvironmentSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.createEnvironmentSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    workspaceId: common_schema_1.id,
    projectId: common_schema_1.id.nullable().optional(),
    stage: zod_1.z.enum(['local', 'development', 'production', 'custom']).default('custom'),
    name: zod_1.z.string().trim().min(1).default('New Environment'),
    variables: zod_1.z.array(common_schema_1.variableSchema).default([]),
});
exports.updateEnvironmentSchema = zod_1.z.object({
    stage: zod_1.z.enum(['local', 'development', 'production', 'custom']).optional(),
    name: zod_1.z.string().trim().min(1).optional(),
    variables: zod_1.z.array(common_schema_1.variableSchema).optional(),
});
