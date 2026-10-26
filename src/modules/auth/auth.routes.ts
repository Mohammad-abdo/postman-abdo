import { Router } from 'express';
import { requireAuth } from '../../core/middleware/auth.middleware';
import { validateBody } from '../../core/middleware/validate.middleware';
import { authController } from './auth.controller';
import { loginSchema, registerSchema, updateProfileSchema } from './auth.schema';

export const authRoutes = Router();

authRoutes.post('/register', validateBody(registerSchema), authController.register);
authRoutes.post('/login', validateBody(loginSchema), authController.login);
authRoutes.get('/me', requireAuth, authController.me);
authRoutes.put('/me', requireAuth, validateBody(updateProfileSchema), authController.updateProfile);
