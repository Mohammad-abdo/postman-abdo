import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { HttpError } from '../errors/http-error';

/** Errors from Express itself and libraries (static files, body parser, multer) carry their own 4xx status. */
function clientErrorStatus(err: unknown): number | null {
  const status = (err as { status?: number; statusCode?: number })?.status ?? (err as { statusCode?: number })?.statusCode;
  return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    const first = err.issues[0];
    return res.status(400).json({ error: `${first.path.join('.') || 'body'}: ${first.message}`, issues: err.issues });
  }
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  const status = clientErrorStatus(err);
  if (status) return res.status(status).json({ error: status === 404 ? 'Not found' : (err as Error).message });
  console.error(err);
  res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
}
