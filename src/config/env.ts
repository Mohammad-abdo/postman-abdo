import 'dotenv/config';
import path from 'path';

const list = (value?: string) =>
  (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const bool = (value: string | undefined, fallback: boolean) => (value === undefined ? fallback : ['1', 'true', 'yes'].includes(value.toLowerCase()));

const nodeEnv = process.env.NODE_ENV || 'development';

export const env = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: Number(process.env.PORT) || 4000,
  jwtSecret: process.env.JWT_SECRET || 'fack-postman-dev-secret',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
  uploadDir: path.resolve(__dirname, '../../uploads'),
  clientDist: path.resolve(__dirname, '../../../client/dist'),
  /** Empty → caching and rate limiting fall back to process memory. */
  redisUrl: process.env.REDIS_URL || '',
  /** Allowed browser origins (comma separated). Empty → allow all (development). */
  corsOrigins: list(process.env.CORS_ORIGINS),
  /** Behind a reverse proxy / load balancer (needed for correct client IPs in rate limiting). */
  trustProxy: bool(process.env.TRUST_PROXY, false),
  /** Stops the hosted executor from reaching private networks (SSRF protection). */
  blockPrivateNetworks: bool(process.env.BLOCK_PRIVATE_NETWORKS, nodeEnv === 'production'),
  /** Super admin created/promoted at startup. */
  adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
} as const;

if (env.isProduction && env.jwtSecret === 'fack-postman-dev-secret') {
  throw new Error('JWT_SECRET must be set in production');
}
