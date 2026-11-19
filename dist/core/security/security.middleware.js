"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PRIVATE_NETWORKS = void 0;
exports.applySecurity = applySecurity;
const compression_1 = __importDefault(require("compression"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const env_1 = require("../../config/env");
/** HTTP hardening: security headers, CORS allow-list, gzip, proxy awareness. */
function applySecurity(app) {
    app.disable('x-powered-by');
    if (env_1.env.trustProxy)
        app.set('trust proxy', 1);
    app.use((0, helmet_1.default)({
        // The API also serves the SPA in single-server deployments; Monaco needs blob workers and inline styles.
        contentSecurityPolicy: {
            useDefaults: true,
            directives: {
                // Visualizer templates (pm.visualizer) run inline/CDN scripts inside a sandboxed srcdoc iframe,
                // which inherits this policy.
                'script-src': ["'self'", 'blob:', "'unsafe-inline'", 'https:'],
                'upgrade-insecure-requests': env_1.env.isProduction ? [] : null,
                'worker-src': ["'self'", 'blob:'],
                'style-src': ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
                'font-src': ["'self'", 'data:', 'https://fonts.gstatic.com'],
                'img-src': ["'self'", 'data:', 'blob:', 'https:'],
                'frame-src': ["'self'", 'data:', 'blob:'],
                'connect-src': ["'self'", 'ws:', 'wss:', 'https:', ...env_1.env.corsOrigins.filter((o) => o !== '*')],
            },
        },
        crossOriginEmbedderPolicy: false,
        crossOriginResourcePolicy: { policy: 'cross-origin' },
    }));
    // CORS_ORIGINS="*" (or empty) allows any origin; otherwise only the listed ones (trailing slashes ignored).
    const allowed = env_1.env.corsOrigins.map((o) => o.replace(/\/+$/, ''));
    const allowAll = !allowed.length || allowed.includes('*');
    app.use((0, cors_1.default)({
        origin: (origin, callback) => {
            // Disallowed origins simply get no CORS headers (the browser blocks them) instead of a server error.
            callback(null, allowAll || !origin || allowed.includes(origin.replace(/\/+$/, '')));
        },
        credentials: true,
        exposedHeaders: ['Content-Disposition', 'Retry-After', 'RateLimit-Remaining'],
        maxAge: 600,
    }));
    // SSE streams (collection runner, real-time fallback) must not be buffered by compression.
    const isStream = (path) => path.endsWith('/execute/run') || path.endsWith('/realtime/stream');
    app.use((0, compression_1.default)({ filter: (req, res) => !isStream(req.path) && compression_1.default.filter(req, res) }));
}
/** CIDR ranges the hosted executor must never reach (cloud metadata, loopback, private LANs). */
exports.PRIVATE_NETWORKS = {
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
