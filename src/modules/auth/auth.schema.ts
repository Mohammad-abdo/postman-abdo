import { z } from 'zod';

export const registerSchema = z.object({
  name: z.string().trim().optional(),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase(),
  password: z.string(),
});

export const updateProfileSchema = z.object({
  name: z.string().trim().min(1).optional(),
  settings: z.record(z.unknown()).optional(),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
