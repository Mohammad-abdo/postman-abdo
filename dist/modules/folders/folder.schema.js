"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.moveFolderSchema = exports.updateFolderSchema = exports.createFolderSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.createFolderSchema = zod_1.z.object({
    id: zod_1.z.string().uuid().optional(),
    collectionId: common_schema_1.id,
    parentId: common_schema_1.id.nullable().optional(),
    name: zod_1.z.string().trim().min(1).default('New Folder'),
});
exports.updateFolderSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    description: zod_1.z.string().nullable().optional(),
    auth: common_schema_1.authSchema.optional(),
    preRequestScript: common_schema_1.scriptSchema,
    testScript: common_schema_1.scriptSchema,
});
exports.moveFolderSchema = zod_1.z.object({
    collectionId: common_schema_1.id,
    parentId: common_schema_1.id.nullable().default(null),
    index: zod_1.z.number().int().min(0).default(0),
});
