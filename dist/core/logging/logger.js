"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.moduleLogger = exports.logger = exports.maskUrl = void 0;
const pino_1 = __importDefault(require("pino"));
const env_1 = require("../../config/env");
/**
 * Application logger.
 * Production: one JSON object per line on stdout — exactly what PM2 (`pm2 logs`) and log shippers expect.
 * Development: human-readable output via pino-pretty.
 * Secrets (auth headers, cookies, passwords, tokens) are redacted.
 */
const TOKEN_IN_URL = /([?&](?:token|access_token|api_key|apikey)=)[^&#\s]+/gi;
/** Masks credentials carried in query strings (the realtime/SSE/ws URLs include the JWT as ?token=). */
const maskUrl = (url) => (url ? url.replace(TOKEN_IN_URL, '$1[REDACTED]') : url);
exports.maskUrl = maskUrl;
const usePretty = !env_1.env.isProduction && process.env.LOG_PRETTY !== 'false';
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || (env_1.env.isProduction ? 'info' : 'debug'),
    base: {
        service: 'fack-postman-api',
        env: env_1.env.nodeEnv,
        pid: process.pid,
        ...(process.env.NODE_APP_INSTANCE !== undefined ? { instance: Number(process.env.NODE_APP_INSTANCE) } : {}),
    },
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
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
const moduleLogger = (module) => exports.logger.child({ module });
exports.moduleLogger = moduleLogger;
