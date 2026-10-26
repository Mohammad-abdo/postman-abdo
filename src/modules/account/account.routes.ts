import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { accountController } from './account.controller';
import { avatarSchema, changePasswordSchema, preferencesSchema, updateProfileSchema } from './account.schema';

export const accountRoutes = Router();

accountRoutes.get('/', accountController.overview);
accountRoutes.put('/profile', validateBody(updateProfileSchema), accountController.updateProfile);
accountRoutes.post('/avatar', validateBody(avatarSchema), accountController.setAvatar);
accountRoutes.put('/password', validateBody(changePasswordSchema), accountController.changePassword);
accountRoutes.post('/logout-all', accountController.logoutEverywhere);
accountRoutes.get('/activity', accountController.activity);
accountRoutes.put('/preferences', validateBody(preferencesSchema), accountController.updatePreferences);
