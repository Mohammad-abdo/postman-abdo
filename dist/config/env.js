"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.env = void 0;
require("dotenv/config");
const path_1 = __importDefault(require("path"));
const list = (value) => (value || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
const bool = (value, fallback) => (value === undefined ? fallback : ['1', 'true', 'yes'].includes(value.toLowerCase()));
const nodeEnv = process.env.NODE_ENV || 'development';
exports.env = {
    nodeEnv,
    isProduction: nodeEnv === 'production',
    port: Number(process.env.PORT) || 4000,
    jwtSecret: process.env.JWT_SECRET || 'fack-postman-dev-secret',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    uploadDir: path_1.default.resolve(__dirname, '../../uploads'),
    clientDist: path_1.default.resolve(__dirname, '../../../client/dist'),
    /** Empty → caching and rate limiting fall back to process memory. */
    redisUrl: process.env.REDIS_URL || '',
    /** Allowed browser origins (comma separated). Empty → allow all (development). */
    corsOrigins: list(process.env.CORS_ORIGINS),
    /** Behind a reverse proxy / load balancer (needed for correct client IPs in rate limiting). */
    trustProxy: bool(process.env.TRUST_PROXY, false),
    /** Stops the hosted executor from reaching private networks (SSRF protection). */
    blockPrivateNetworks: bool(process.env.BLOCK_PRIVATE_NETWORKS, nodeEnv === 'production'),
    /** Optional AI assistant for test apps. Off unless explicitly enabled AND a key is provided. */
    ai: {
        enabled: bool(process.env.TESTAPP_AI_ENABLED, false) && !!process.env.ANTHROPIC_API_KEY,
        apiKey: process.env.ANTHROPIC_API_KEY || '',
        model: process.env.TESTAPP_AI_MODEL || 'claude-sonnet-5-5',
        dailyTokenBudget: Number(process.env.TESTAPP_AI_DAILY_TOKENS) || 50000,
    },
    /** Super admin created/promoted at startup. */
    adminEmail: (process.env.ADMIN_EMAIL || '').toLowerCase(),
    adminPassword: process.env.ADMIN_PASSWORD || '',
};
if (exports.env.isProduction && exports.env.jwtSecret === 'fack-postman-dev-secret') {
    throw new Error('JWT_SECRET must be set in production');
}
