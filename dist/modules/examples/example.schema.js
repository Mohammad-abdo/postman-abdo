"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateExampleSchema = exports.createExampleSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
const exampleFields = zod_1.z.object({
    name: zod_1.z.string().trim().min(1),
    request: zod_1.z.record(zod_1.z.unknown()).nullable(),
    code: zod_1.z.number().int().min(100).max(599),
    status: zod_1.z.string(),
    headers: zod_1.z.array(common_schema_1.keyValueSchema),
    body: zod_1.z.string().nullable(),
    language: zod_1.z.string(),
});
exports.createExampleSchema = exampleFields.partial().extend({ requestId: common_schema_1.id, id: zod_1.z.string().uuid().optional() });
exports.updateExampleSchema = exampleFields.partial();
