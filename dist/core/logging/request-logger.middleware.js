"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requestLogger = void 0;
const crypto_1 = require("crypto");
const pino_http_1 = __importDefault(require("pino-http"));
const logger_1 = require("./logger");
const REQUEST_ID_HEADER = 'x-request-id';
/**
 * One log line per HTTP request: method, url (tokens masked), status, duration, user, ip, size.
 * Reuses an incoming X-Request-Id (from a proxy/load balancer) or creates one, and returns it in the response.
 */
exports.requestLogger = (0, pino_http_1.default)({
    logger: logger_1.logger,
    genReqId: (req, res) => {
        const incoming = req.headers[REQUEST_ID_HEADER];
        const id = (Array.isArray(incoming) ? incoming[0] : incoming) || (0, crypto_1.randomUUID)();
        res.setHeader('X-Request-Id', id);
        return id;
    },
    // Health checks from PM2/load balancers would drown everything else.
    autoLogging: { ignore: (req) => (req.url || '').startsWith('/api/health') },
    customLogLevel: (_req, res, err) => (err || res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'),
    customSuccessMessage: (req, res) => `${req.method} ${(0, logger_1.maskUrl)(req.originalUrl || req.url)} ${res.statusCode}`,
    customErrorMessage: (req, res) => `${req.method} ${(0, logger_1.maskUrl)(req.originalUrl || req.url)} ${res.statusCode}`,
    customProps: (req) => ({ userId: req.userId }),
    serializers: {
        req: (req) => ({
            id: req.id,
            method: req.method,
            url: (0, logger_1.maskUrl)(req.raw?.originalUrl || req.url),
            ip: req.raw?.ip || req.remoteAddress,
            userAgent: req.headers?.['user-agent'],
        }),
        res: (res) => ({
            statusCode: res.statusCode,
            contentLength: res.headers?.['content-length'],
        }),
    },
});
