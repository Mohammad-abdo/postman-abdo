"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.updateProfileSchema = exports.loginSchema = exports.registerSchema = void 0;
const zod_1 = require("zod");
exports.registerSchema = zod_1.z.object({
    name: zod_1.z.string().trim().optional(),
    email: zod_1.z.string().trim().toLowerCase().email(),
    password: zod_1.z.string().min(6, 'Password must be at least 6 characters'),
});
exports.loginSchema = zod_1.z.object({
    email: zod_1.z.string().trim().toLowerCase(),
    password: zod_1.z.string(),
});
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).optional(),
    settings: zod_1.z.record(zod_1.z.unknown()).optional(),
});
