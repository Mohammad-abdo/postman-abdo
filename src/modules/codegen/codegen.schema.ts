import { z } from 'zod';
import { id } from '../../shared/validation/common.schema';

export const generateSnippetSchema = z.object({
  workspaceId: id,
  environmentId: id.nullable().optional(),
  request: z.record(z.unknown()),
  language: z.string().default('curl'),
  variant: z.string().default('cURL'),
  options: z.record(z.unknown()).default({ indentCount: 2, indentType: 'Space', trimRequestBody: true, followRedirect: true }),
});

export type GenerateSnippetInput = z.infer<typeof generateSnippetSchema>;
