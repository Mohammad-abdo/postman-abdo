"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Conflict = exports.NotFound = exports.Forbidden = exports.Unauthorized = exports.BadRequest = exports.HttpError = void 0;
class HttpError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
        this.name = 'HttpError';
    }
}
exports.HttpError = HttpError;
const BadRequest = (message = 'Bad request') => new HttpError(400, message);
exports.BadRequest = BadRequest;
const Unauthorized = (message = 'Unauthorized') => new HttpError(401, message);
exports.Unauthorized = Unauthorized;
const Forbidden = (message = 'Forbidden') => new HttpError(403, message);
exports.Forbidden = Forbidden;
const NotFound = (message = 'Not found') => new HttpError(404, message);
exports.NotFound = NotFound;
const Conflict = (message = 'Conflict') => new HttpError(409, message);
exports.Conflict = Conflict;
