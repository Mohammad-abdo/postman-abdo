"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.historyEntrySchema = exports.heartbeatSchema = void 0;
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
exports.heartbeatSchema = zod_1.z.object({
    deviceId: zod_1.z.string().uuid(),
    platform: zod_1.z.enum(['web', 'desktop']).default('web'),
    appVersion: zod_1.z.string().max(40).optional(),
    pendingOps: zod_1.z.number().int().min(0).default(0),
    lastSyncAt: zod_1.z.string().datetime().nullable().optional(),
});
/** A request executed on a device (desktop app), added to the account history. */
exports.historyEntrySchema = zod_1.z.object({
    id: zod_1.z.string().uuid(),
    workspaceId: common_schema_1.id,
    method: zod_1.z.string().min(1).max(20),
    url: zod_1.z.string().max(10_000),
    name: zod_1.z.string().nullable().optional(),
    request: zod_1.z.record(zod_1.z.unknown()),
    response: zod_1.z.record(zod_1.z.unknown()).nullable().optional(),
    createdAt: zod_1.z.string().datetime().optional(),
});
