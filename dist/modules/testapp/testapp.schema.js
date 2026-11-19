"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runSchema = exports.resetSchema = exports.invokeSchema = exports.createSessionSchema = exports.regenerateSchema = exports.overrideSchema = exports.realInvokeSchema = exports.rulesSchema = exports.updateTestAppSchema = exports.customTestSchema = exports.createTestAppSchema = exports.analyzeSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
const scenario = zod_1.z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']);
exports.analyzeSchema = zod_1.z.object({ collectionId: common_schema_1.id });
exports.createTestAppSchema = zod_1.z.object({
    collectionId: common_schema_1.id,
    name: zod_1.z.string().trim().min(1).max(120).optional(),
    seed: zod_1.z.number().int().min(1).max(2_000_000_000).default(1),
});
const realSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    allowedHosts: zod_1.z.array(zod_1.z.string().trim().min(3).max(255).regex(/^[A-Za-z0-9.*-]+$/, 'Use a host name like api.example.com or .example.com')).max(20),
    baseUrl: zod_1.z.union([zod_1.z.string().url().max(500), zod_1.z.literal('')]).optional(),
    environmentId: common_schema_1.id.nullable().optional(),
    runScripts: zod_1.z.boolean().optional(),
    allowUnsafe: zod_1.z.boolean().optional(),
});
exports.customTestSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(200),
    endpoint: zod_1.z.string().min(1).max(500),
    pathParams: zod_1.z.record(zod_1.z.string().max(200)).optional(),
    query: zod_1.z.record(zod_1.z.string().max(500)).optional(),
    body: zod_1.z.any().optional(),
    scenario: scenario.optional(),
    noAuth: zod_1.z.boolean().optional(),
    expectStatus: zod_1.z.number().int().min(100).max(599),
    expectBodyKeys: zod_1.z.array(zod_1.z.string().max(200)).max(30).optional(),
    origin: zod_1.z.enum(['user', 'ai']).optional(),
    reason: zod_1.z.string().max(400).optional(),
});
exports.updateTestAppSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120).optional(),
    settings: zod_1.z
        .object({
        validation: zod_1.z.enum(['lenient', 'strict']).optional(),
        rows: zod_1.z.number().int().min(0).max(200).optional(),
        real: realSchema.optional(),
        customTests: zod_1.z.array(exports.customTestSchema).max(100).optional(),
    })
        .strict()
        .optional(),
});
exports.rulesSchema = zod_1.z.object({ custom: zod_1.z.array(zod_1.z.any()).max(50).default([]), disabled: zod_1.z.array(zod_1.z.string().max(60)).max(60).default([]) });
exports.realInvokeSchema = zod_1.z.object({ actionId: zod_1.z.string().min(1).max(200), values: zod_1.z.record(zod_1.z.any()).default({}), confirmUnsafe: zod_1.z.boolean().optional(), confirmProduction: zod_1.z.boolean().optional() });
exports.overrideSchema = zod_1.z.object({
    decision: zod_1.z
        .object({ exclude: zod_1.z.string().max(200).optional(), include: zod_1.z.boolean().optional(), title: zod_1.z.string().trim().min(1).max(120).optional() })
        .refine((d) => Object.keys(d).length > 0, 'Empty decision'),
});
exports.regenerateSchema = zod_1.z.object({ preview: zod_1.z.boolean().default(false), seed: zod_1.z.number().int().min(1).max(2_000_000_000).optional() });
exports.createSessionSchema = zod_1.z.object({ versionId: common_schema_1.id.optional(), seed: zod_1.z.number().int().min(1).max(2_000_000_000).optional() });
exports.invokeSchema = zod_1.z
    .object({
    actionId: zod_1.z.string().max(200).optional(),
    endpoint: zod_1.z.string().max(500).optional(),
    values: zod_1.z.record(zod_1.z.any()).default({}),
    pathParams: zod_1.z.record(zod_1.z.string()).optional(),
    query: zod_1.z.record(zod_1.z.string()).optional(),
    body: zod_1.z.any().optional(),
    scenario: scenario.optional(),
})
    .refine((v) => v.actionId || v.endpoint, 'actionId or endpoint is required');
exports.resetSchema = zod_1.z.object({ seed: zod_1.z.number().int().min(1).max(2_000_000_000).optional() });
exports.runSchema = zod_1.z.object({ mode: zod_1.z.enum(['mock', 'real', 'compare']).default('mock'), confirmUnsafe: zod_1.z.boolean().optional(), confirmProduction: zod_1.z.boolean().optional() });
