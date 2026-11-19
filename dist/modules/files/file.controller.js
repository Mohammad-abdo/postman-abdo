"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fileController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../config/env");
const prisma_1 = require("../../core/database/prisma");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const http_error_1 = require("../../core/errors/http-error");
const limits_service_1 = require("../platform/limits.service");
/** Files attached to form-data / binary bodies. Every upload is tracked per user for quotas and the admin dashboard. */
exports.fileController = {
    upload: async (req, res) => {
        if (!req.file)
            throw (0, http_error_1.BadRequest)('No file uploaded');
        const userId = (0, auth_middleware_1.currentUserId)(req);
        try {
            await limits_service_1.limitsService.assertCanUpload(userId, req.file.size);
        }
        catch (e) {
            fs_1.default.rm(req.file.path, () => undefined);
            throw e;
        }
        await prisma_1.prisma.uploadedFile.create({
            data: {
                userId,
                workspaceId: typeof req.body.workspaceId === 'string' ? req.body.workspaceId : null,
                storedName: req.file.filename,
                originalName: req.file.originalname,
                mimeType: req.file.mimetype,
                size: req.file.size,
            },
        });
        res.json({ src: req.file.filename, name: req.file.originalname, size: req.file.size });
    },
    download: (req, res) => {
        const stored = path_1.default.basename(req.params.name);
        const filePath = path_1.default.join(env_1.env.uploadDir, stored);
        if (!fs_1.default.existsSync(filePath))
            throw (0, http_error_1.NotFound)('File not found');
        res.download(filePath, stored.split('__').slice(1).join('__') || stored);
    },
};
