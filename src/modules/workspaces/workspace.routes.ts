import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { workspaceController } from './workspace.controller';
import { addMemberSchema, createWorkspaceSchema, updateMemberSchema, updateWorkspaceSchema } from './workspace.schema';

export const workspaceRoutes = Router();

workspaceRoutes.get('/', workspaceController.list);
workspaceRoutes.post('/', validateBody(createWorkspaceSchema), workspaceController.create);
workspaceRoutes.put('/:id', validateBody(updateWorkspaceSchema), workspaceController.update);
workspaceRoutes.delete('/:id', workspaceController.remove);
workspaceRoutes.post('/:id/members', validateBody(addMemberSchema), workspaceController.addMember);
workspaceRoutes.patch('/:id/members/:userId', validateBody(updateMemberSchema), workspaceController.updateMember);
workspaceRoutes.delete('/:id/members/:userId', workspaceController.removeMember);
workspaceRoutes.get('/:id/overview', workspaceController.overview);
workspaceRoutes.get('/:id/tree', workspaceController.tree);
workspaceRoutes.get('/:id/search', workspaceController.search);
