"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileRoutes = void 0;
const express_1 = require("express");
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const crypto_1 = require("crypto");
const env_1 = require("../../config/env");
const rate_limit_middleware_1 = require("../../core/security/rate-limit.middleware");
const file_controller_1 = require("./file.controller");
fs_1.default.mkdirSync(env_1.env.uploadDir, { recursive: true });
/** Stored as `<uuid>__<original name>` so the original name can be recovered for downloads. */
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: env_1.env.uploadDir,
        filename: (_req, file, cb) => cb(null, `${(0, crypto_1.randomUUID)()}__${file.originalname.replace(/[^\w.\- ]+/g, '_')}`),
    }),
    limits: { fileSize: 200 * 1024 * 1024 },
});
exports.fileRoutes = (0, express_1.Router)();
exports.fileRoutes.post('/', rate_limit_middleware_1.rateLimits.upload(), upload.single('file'), file_controller_1.fileController.upload);
exports.fileRoutes.get('/:name', file_controller_1.fileController.download);
