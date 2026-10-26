import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const importSchema = z
  .object({
    workspaceId: id,
    text: z.string().optional(),
    url: z.string().url().optional(),
  })
  .refine((v) => v.text || v.url, 'Provide text or a url to import');

export const parseCurlSchema = z.object({ text: z.string().min(1) });
