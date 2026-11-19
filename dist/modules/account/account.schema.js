"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.preferencesSchema = exports.changePasswordSchema = exports.avatarSchema = exports.MAX_AVATAR_BYTES = exports.updateProfileSchema = void 0;
const zod_1 = require("zod");
const optionalText = (max) => zod_1.z.string().trim().max(max).nullable().optional();
exports.updateProfileSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(120).optional(),
    bio: optionalText(1000),
    company: optionalText(120),
    jobTitle: optionalText(120),
    location: optionalText(120),
    website: zod_1.z
        .string()
        .trim()
        .max(300)
        .refine((v) => !v || /^https?:\/\//i.test(v), 'Website must start with http:// or https://')
        .nullable()
        .optional(),
});
/** Avatars are stored inline as data URLs (small images only). */
exports.MAX_AVATAR_BYTES = 512 * 1024;
exports.avatarSchema = zod_1.z.object({
    dataUrl: zod_1.z
        .string()
        .regex(/^data:image\/(png|jpe?g|gif|webp);base64,/, 'Avatar must be a PNG, JPG, GIF or WebP image')
        .refine((v) => (v.length * 3) / 4 <= exports.MAX_AVATAR_BYTES * 1.37, 'Avatar must be 512 KB or smaller')
        .nullable(),
});
exports.changePasswordSchema = zod_1.z.object({
    currentPassword: zod_1.z.string().min(1),
    newPassword: zod_1.z.string().min(6, 'Password must be at least 6 characters').max(200),
});
exports.preferencesSchema = zod_1.z.object({ settings: zod_1.z.record(zod_1.z.unknown()) });
