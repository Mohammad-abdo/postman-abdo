"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scriptSchema = exports.bodySchema = exports.authSchema = exports.variableSchema = exports.keyValueSchema = exports.id = void 0;
const zod_1 = require("zod");
exports.id = zod_1.z.string().min(1);
exports.keyValueSchema = zod_1.z
    .object({
    key: zod_1.z.string().default(''),
    value: zod_1.z.string().default(''),
    enabled: zod_1.z.boolean().optional(),
    description: zod_1.z.string().optional(),
})
    .passthrough();
exports.variableSchema = exports.keyValueSchema.extend({
    currentValue: zod_1.z.string().optional(),
    type: zod_1.z.enum(['default', 'secret']).optional(),
});
exports.authSchema = zod_1.z.object({ type: zod_1.z.string() }).passthrough();
exports.bodySchema = zod_1.z
    .object({
    mode: zod_1.z.enum(['none', 'raw', 'urlencoded', 'formdata', 'file', 'graphql']),
})
    .passthrough();
exports.scriptSchema = zod_1.z.string().nullable().optional();
