"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateBody = void 0;
/** Validates and replaces `req.body` with the parsed value. */
const validateBody = (schema) => (req, _res, next) => {
    req.body = schema.parse(req.body ?? {});
    next();
};
exports.validateBody = validateBody;
