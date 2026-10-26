import { NextFunction, Request, Response } from 'express';
import { ZodTypeAny } from 'zod';

/** Validates and replaces `req.body` with the parsed value. */
export const validateBody = (schema: ZodTypeAny) => (req: Request, _res: Response, next: NextFunction) => {
  req.body = schema.parse(req.body ?? {});
  next();
};
