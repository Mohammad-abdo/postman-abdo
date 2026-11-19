"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
const zod_1 = require("zod");
const http_error_1 = require("../errors/http-error");
/** Errors from Express itself and libraries (static files, body parser, multer) carry their own 4xx status. */
function clientErrorStatus(err) {
    const status = err?.status ?? err?.statusCode;
    return typeof status === 'number' && status >= 400 && status < 500 ? status : null;
}
function errorHandler(err, _req, res, _next) {
    if (err instanceof zod_1.ZodError) {
        const first = err.issues[0];
        return res.status(400).json({ error: `${first.path.join('.') || 'body'}: ${first.message}`, issues: err.issues });
    }
    if (err instanceof http_error_1.HttpError)
        return res.status(err.status).json({ error: err.message });
    const status = clientErrorStatus(err);
    if (status)
        return res.status(status).json({ error: status === 404 ? 'Not found' : err.message });
    console.error(err);
    res.status(500).json({ error: err instanceof Error ? err.message : 'Internal Server Error' });
}
