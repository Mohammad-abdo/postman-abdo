import { randomUUID } from 'crypto';
import { IncomingMessage, ServerResponse } from 'http';
import pinoHttp from 'pino-http';
import { logger, maskUrl } from './logger';

const REQUEST_ID_HEADER = 'x-request-id';

type Req = IncomingMessage & { id?: string; userId?: string; originalUrl?: string; ip?: string };

/**
 * One log line per HTTP request: method, url (tokens masked), status, duration, user, ip, size.
 * Reuses an incoming X-Request-Id (from a proxy/load balancer) or creates one, and returns it in the response.
 */
export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const incoming = req.headers[REQUEST_ID_HEADER];
    const id = (Array.isArray(incoming) ? incoming[0] : incoming) || randomUUID();
    res.setHeader('X-Request-Id', id);
    return id;
  },
  // Health checks from PM2/load balancers would drown everything else.
  autoLogging: { ignore: (req) => (req.url || '').startsWith('/api/health') },
  customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
  customSuccessMessage: (req, res) => `${req.method} ${maskUrl((req as Req).originalUrl || req.url)} ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${maskUrl((req as Req).originalUrl || req.url)} ${res.statusCode}`,
  customProps: (req) => ({ userId: (req as Req).userId }),
  serializers: {
    req: (req: Req & { raw?: Req; remoteAddress?: string }) => ({
      id: req.id,
      method: req.method,
      url: maskUrl(req.raw?.originalUrl || req.url),
      ip: req.raw?.ip || req.remoteAddress,
      userAgent: req.headers?.['user-agent'],
    }),
    res: (res: ServerResponse & { headers?: Record<string, unknown> }) => ({
      statusCode: res.statusCode,
      contentLength: res.headers?.['content-length'],
    }),
  },
});
