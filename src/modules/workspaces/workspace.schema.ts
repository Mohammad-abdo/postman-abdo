import { z } from 'zod';

export const createWorkspaceSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1).default('Untitled Workspace'),
  description: z.string().optional(),
  type: z.enum(['personal', 'team']).default('personal'),
});

export const updateWorkspaceSchema = createWorkspaceSchema.omit({ id: true }).partial();

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(['admin', 'editor', 'viewer']).default('editor'),
});

export type CreateWorkspaceInput = z.input<typeof createWorkspaceSchema>;
export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
export type AddMemberInput = z.infer<typeof addMemberSchema>;
