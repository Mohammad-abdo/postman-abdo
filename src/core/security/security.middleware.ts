import { Express } from 'express';
import compression from 'compression';
import cors from 'cors';
import helmet from 'helmet';
import { env } from '../../config/env';

/** HTTP hardening: security headers, CORS allow-list, gzip, proxy awareness. */
export function applySecurity(app: Express) {
  app.disable('x-powered-by');
  if (env.trustProxy) app.set('trust proxy', 1);

  app.use(
    helmet({
      // The API also serves the SPA in single-server deployments; Monaco needs blob workers and inline styles.
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          // Visualizer templates (pm.visualizer) run inline/CDN scripts inside a sandboxed srcdoc iframe,
          // which inherits this policy.
          'script-src': ["'self'", 'blob:', "'unsafe-inline'", 'https:'],
          'upgrade-insecure-requests': env.isProduction ? [] : null,
          'worker-src': ["'self'", 'blob:'],
          'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
          'img-src': ["'self'", 'data:', 'blob:', 'https:'],
          'frame-src': ["'self'", 'data:', 'blob:'],
          'connect-src': ["'self'", 'ws:', 'wss:', 'https:', ...env.corsOrigins.filter((o) => o !== '*')],
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: 'cross-origin' },
    }),
  );

  // CORS_ORIGINS="*" (or empty) allows any origin; otherwise only the listed ones (trailing slashes ignored).
  const allowed = env.corsOrigins.map((o) => o.replace(/\/+$/, ''));
  const allowAll = !allowed.length || allowed.includes('*');

  app.use(
    cors({
      origin: (origin, callback) => {
        // Disallowed origins simply get no CORS headers (the browser blocks them) instead of a server error.
        callback(null, allowAll || !origin || allowed.includes(origin.replace(/\/+$/, '')));
      },
      credentials: true,
      exposedHeaders: ['Content-Disposition', 'Retry-After', 'RateLimit-Remaining'],
      maxAge: 600,
    }),
  );

  // SSE streams (collection runner) must not be buffered by compression.
  app.use(compression({ filter: (req, res) => !req.path.endsWith('/execute/run') && compression.filter(req, res) }));
}

/** CIDR ranges the hosted executor must never reach (cloud metadata, loopback, private LANs). */
export const PRIVATE_NETWORKS: Record<string, boolean> = {
  '0.0.0.0/8': true,
  '10.0.0.0/8': true,
  '100.64.0.0/10': true,
  '127.0.0.0/8': true,
  '169.254.0.0/16': true,
  '172.16.0.0/12': true,
  '192.168.0.0/16': true,
  '::1/128': true,
  'fc00::/7': true,
  'fe80::/10': true,
  localhost: true,
};
