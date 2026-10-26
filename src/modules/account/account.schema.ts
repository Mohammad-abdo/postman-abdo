import { z } from 'zod';

const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  bio: optionalText(1000),
  company: optionalText(120),
  jobTitle: optionalText(120),
  location: optionalText(120),
  website: z
    .string()
    .trim()
    .max(300)
    .refine((v) => !v || /^https?:\/\//i.test(v), 'Website must start with http:// or https://')
    .nullable()
    .optional(),
});

/** Avatars are stored inline as data URLs (small images only). */
export const MAX_AVATAR_BYTES = 512 * 1024;
export const avatarSchema = z.object({
  dataUrl: z
    .string()
    .regex(/^data:image\/(png|jpe?g|gif|webp);base64,/, 'Avatar must be a PNG, JPG, GIF or WebP image')
    .refine((v) => (v.length * 3) / 4 <= MAX_AVATAR_BYTES * 1.37, 'Avatar must be 512 KB or smaller')
    .nullable(),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(6, 'Password must be at least 6 characters').max(200),
});

export const preferencesSchema = z.object({ settings: z.record(z.unknown()) });

export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
