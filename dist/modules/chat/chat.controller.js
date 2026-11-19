"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.chatController = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const prisma_1 = require("../../core/database/prisma");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const http_error_1 = require("../../core/errors/http-error");
const limits_service_1 = require("../platform/limits.service");
const workspace_access_1 = require("../workspaces/workspace.access");
const chat_service_1 = require("./chat.service");
const chat_upload_1 = require("./chat.upload");
/** Only these are rendered inline by the browser; anything else (HTML, SVG, scripts…) is always a download. */
const INLINE_TYPES = /^(image\/(png|jpe?g|gif|webp|avif|bmp)|video\/(mp4|webm|ogg|quicktime)|audio\/(mpeg|mp3|ogg|wav|webm|mp4|aac|x-m4a|m4a|flac))$/i;
exports.chatController = {
    list: async (req, res) => res.json(await chat_service_1.chatService.list((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    open: async (req, res) => res.json(await chat_service_1.chatService.open((0, auth_middleware_1.currentUserId)(req), req.body)),
    update: async (req, res) => res.json(await chat_service_1.chatService.update((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    addMembers: async (req, res) => res.json(await chat_service_1.chatService.addMembers((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body.userIds)),
    leave: async (req, res) => res.json(await chat_service_1.chatService.leave((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    messages: async (req, res) => res.json(await chat_service_1.chatService.messages((0, auth_middleware_1.currentUserId)(req), req.params.id, req.query.before ? String(req.query.before) : undefined)),
    send: async (req, res) => res.json(await chat_service_1.chatService.send((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body)),
    markRead: async (req, res) => res.json(await chat_service_1.chatService.markRead((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    edit: async (req, res) => res.json(await chat_service_1.chatService.edit((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body.body)),
    remove: async (req, res) => res.json(await chat_service_1.chatService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    readers: async (req, res) => res.json(await chat_service_1.chatService.readers((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    react: async (req, res) => res.json(await chat_service_1.chatService.react((0, auth_middleware_1.currentUserId)(req), req.params.id, req.body.emoji)),
    presence: async (req, res) => res.json(await chat_service_1.chatService.presence((0, auth_middleware_1.currentUserId)(req), String(req.query.workspaceId || ''))),
    /** Stores one chat attachment; the client then references it by `file` when sending the message. */
    upload: async (req, res) => {
        if (!req.file)
            throw (0, http_error_1.BadRequest)('No file uploaded');
        const userId = (0, auth_middleware_1.currentUserId)(req);
        const workspaceId = String(req.body.workspaceId || '');
        try {
            await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
            await limits_service_1.limitsService.assertCanUpload(userId, req.file.size);
        }
        catch (e) {
            fs_1.default.rm(req.file.path, () => undefined);
            throw e;
        }
        // multer reads names as latin1; restore UTF-8 so Arabic and other non-ASCII names survive.
        const originalName = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
        const mimeType = (req.file.mimetype || 'application/octet-stream').split(';')[0].trim().toLowerCase();
        await prisma_1.prisma.uploadedFile.create({
            data: { userId, workspaceId, storedName: req.file.filename, originalName, mimeType, size: req.file.size },
        });
        res.json({ file: req.file.filename, name: originalName, mimeType, size: req.file.size });
    },
    /** Streams an attachment with Range support so videos and voice notes can seek. Auth via header or `?token=`. */
    media: async (req, res) => {
        const stored = path_1.default.basename(req.params.name);
        const upload = await chat_service_1.chatService.mediaFor((0, auth_middleware_1.currentUserId)(req), stored);
        const filePath = path_1.default.join(chat_upload_1.CHAT_UPLOAD_DIR, stored);
        if (!fs_1.default.existsSync(filePath))
            throw (0, http_error_1.BadRequest)('File no longer exists');
        const mimeType = upload.mimeType || 'application/octet-stream';
        const inline = INLINE_TYPES.test(mimeType);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
        res.setHeader('Cache-Control', 'private, max-age=86400');
        res.setHeader('Content-Type', inline ? mimeType : 'application/octet-stream');
        const encoded = encodeURIComponent(upload.originalName);
        const disposition = inline && req.query.download !== '1' ? 'inline' : 'attachment';
        res.setHeader('Content-Disposition', `${disposition}; filename*=UTF-8''${encoded}`);
        res.sendFile(filePath, { headers: {} });
    },
};
