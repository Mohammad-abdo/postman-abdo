import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { accountController } from './account.controller';
import { audit } from '../../core/audit/audit.service';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { apiKeysService, createKeySchema, updateKeySchema } from './apikeys.service';
import { avatarSchema, changePasswordSchema, preferencesSchema, updateProfileSchema } from './account.schema';

export const accountRoutes = Router();

accountRoutes.get('/', accountController.overview);
accountRoutes.put('/profile', validateBody(updateProfileSchema), accountController.updateProfile);
accountRoutes.post('/avatar', validateBody(avatarSchema), accountController.setAvatar);
accountRoutes.put('/password', validateBody(changePasswordSchema), accountController.changePassword);
accountRoutes.post('/logout-all', accountController.logoutEverywhere);
accountRoutes.get('/activity', accountController.activity);
accountRoutes.put('/preferences', validateBody(preferencesSchema), accountController.updatePreferences);

/* Bring your own AI key: several keys per person, each can be switched on or off and capped. Secrets never leave the server. */
accountRoutes.get('/api-keys', async (req, res) => res.json(await apiKeysService.list(currentUserId(req))));
accountRoutes.post('/api-keys', validateBody(createKeySchema), async (req, res) => {
  const out = await apiKeysService.create(currentUserId(req), req.body);
  audit(req, { action: 'account.apikey.create', targetType: 'apikey', targetId: out.id, details: { label: out.label } });
  res.status(201).json(out);
});
accountRoutes.patch('/api-keys/:id', validateBody(updateKeySchema), async (req, res) => {
  const out = await apiKeysService.update(currentUserId(req), String(req.params.id), req.body);
  audit(req, { action: 'account.apikey.update', targetType: 'apikey', targetId: out.id, details: { active: out.active, dailyLimit: out.dailyLimit, totalLimit: out.totalLimit } });
  res.json(out);
});
accountRoutes.delete('/api-keys/:id', async (req, res) => {
  const out = await apiKeysService.remove(currentUserId(req), String(req.params.id));
  audit(req, { action: 'account.apikey.delete', targetType: 'apikey', targetId: String(req.params.id) });
  res.json(out);
});
accountRoutes.post('/api-keys/:id/test', async (req, res) => res.json(await apiKeysService.test(currentUserId(req), String(req.params.id))));
