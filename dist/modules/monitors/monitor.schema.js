"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateMonitorSchema = exports.createMonitorSchema = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const zod_1 = require("zod");
const common_schema_1 = require("../../shared/validation/common.schema");
const cronExpression = zod_1.z.string().refine((v) => node_cron_1.default.validate(v), 'Invalid schedule');
exports.createMonitorSchema = zod_1.z.object({
    workspaceId: common_schema_1.id,
    collectionId: common_schema_1.id,
    environmentId: common_schema_1.id.nullable().optional(),
    name: zod_1.z.string().trim().min(1).default('New Monitor'),
    cron: cronExpression.default('0 * * * *'),
});
exports.updateMonitorSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    environmentId: common_schema_1.id.nullable().optional(),
    cron: cronExpression.optional(),
    enabled: zod_1.z.boolean().optional(),
});
