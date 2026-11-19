"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatUpload = exports.CHAT_UPLOAD_DIR = void 0;
const crypto_1 = require("crypto");
const fs_1 = __importDefault(require("fs"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../config/env");
exports.CHAT_UPLOAD_DIR = path_1.default.join(env_1.env.uploadDir, 'chat');
fs_1.default.mkdirSync(exports.CHAT_UPLOAD_DIR, { recursive: true });
/** Stored under a random name; the extension is kept (sanitised) so downloads open with the right app. */
exports.chatUpload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: exports.CHAT_UPLOAD_DIR,
        filename: (_req, file, cb) => cb(null, `${(0, crypto_1.randomUUID)()}${path_1.default.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '').slice(0, 12)}`),
    }),
    limits: { fileSize: 100 * 1024 * 1024, files: 1 },
});
