import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { projectController } from './project.controller';
import { addProjectMemberSchema, createProjectSchema, updateProjectMemberSchema, updateProjectSchema } from './project.schema';

export const projectRoutes = Router();

projectRoutes.get('/', projectController.list);
projectRoutes.post('/', validateBody(createProjectSchema), projectController.create);
projectRoutes.get('/:id', projectController.get);
projectRoutes.put('/:id', validateBody(updateProjectSchema), projectController.update);
projectRoutes.delete('/:id', projectController.remove);
projectRoutes.get('/:id/members', projectController.members);
projectRoutes.post('/:id/members', validateBody(addProjectMemberSchema), projectController.addMember);
projectRoutes.patch('/:id/members/:userId', validateBody(updateProjectMemberSchema), projectController.updateMember);
projectRoutes.delete('/:id/members/:userId', projectController.removeMember);
projectRoutes.put('/:id/collections/:collectionId', projectController.attachCollection);
projectRoutes.delete('/:id/collections/:collectionId', projectController.detachCollection);
