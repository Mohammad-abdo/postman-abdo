import { AuthContext } from '../core/auth/permissions';

declare global {
  namespace Express {
    interface Request {
      userId?: string;
      auth?: AuthContext;
    }
  }
}

export {};
