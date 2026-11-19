"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parseCurlSchema = exports.importSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.importSchema = zod_1.z
    .object({
    workspaceId: common_schema_1.id,
    text: zod_1.z.string().optional(),
    url: zod_1.z.string().url().optional(),
})
    .refine((v) => v.text || v.url, 'Provide text or a url to import');
exports.parseCurlSchema = zod_1.z.object({ text: zod_1.z.string().min(1) });
