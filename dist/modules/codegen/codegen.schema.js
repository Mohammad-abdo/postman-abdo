"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateSnippetSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.generateSnippetSchema = zod_1.z.object({
    workspaceId: common_schema_1.id,
    environmentId: common_schema_1.id.nullable().optional(),
    request: zod_1.z.record(zod_1.z.unknown()),
    language: zod_1.z.string().default('curl'),
    variant: zod_1.z.string().default('cURL'),
    options: zod_1.z.record(zod_1.z.unknown()).default({ indentCount: 2, indentType: 'Space', trimRequestBody: true, followRedirect: true }),
});
