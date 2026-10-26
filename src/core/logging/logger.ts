import pino from 'pino';
import { env } from '../../config/env';

/**
 * Application logger.
 * Production: one JSON object per line on stdout — exactly what PM2 (`pm2 logs`) and log shippers expect.
 * Development: human-readable output via pino-pretty.
 * Secrets (auth headers, cookies, passwords, tokens) are redacted.
 */

const TOKEN_IN_URL = /([?&](?:token|access_token|api_key|apikey)=)[^&#\s]+/gi;

/** Masks credentials carried in query strings (the realtime/SSE/ws URLs include the JWT as ?token=). */
export const maskUrl = (url?: string) => (url ? url.replace(TOKEN_IN_URL, '$1[REDACTED]') : url);

const usePretty = !env.isProduction && process.env.LOG_PRETTY !== 'false';

export const logger = pino({
  level: process.env.LOG_LEVEL || (env.isProduction ? 'info' : 'debug'),
  base: {
    service: 'fack-postman-api',
    env: env.nodeEnv,
    pid: process.pid,
    ...(process.env.NODE_APP_INSTANCE !== undefined ? { instance: Number(process.env.NODE_APP_INSTANCE) } : {}),
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["idempotency-key"]',
      'res.headers["set-cookie"]',
      '*.password',
      '*.passwordHash',
      '*.token',
      '*.accessToken',
      '*.refreshToken',
      '*.secret',
    ],
    censor: '[REDACTED]',
  },
  ...(usePretty
    ? { transport: { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss.l', ignore: 'pid,hostname,service,env' } } }
    : {}),
});

/** Child logger for one area of the app, e.g. `moduleLogger('monitors')`. */
export const moduleLogger = (module: string) => logger.child({ module });
