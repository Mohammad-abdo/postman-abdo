"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.notificationAdminController = exports.notificationController = void 0;
const fs_1 = __importDefault(require("fs"));
const audit_service_1 = require("../../core/audit/audit.service");
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const notification_service_1 = require("./notification.service");
const sound_service_1 = require("./sound.service");
exports.notificationController = {
    list: async (req, res) => res.json(await notification_service_1.notificationService.list((0, auth_middleware_1.currentUserId)(req), { cursor: req.query.cursor, unreadOnly: req.query.unread === 'true' })),
    unreadCount: async (req, res) => res.json({ unread: await notification_service_1.notificationService.unreadCount((0, auth_middleware_1.currentUserId)(req)) }),
    markRead: async (req, res) => res.json(await notification_service_1.notificationService.markRead((0, auth_middleware_1.currentUserId)(req), req.body.ids)),
    remove: async (req, res) => res.json(await notification_service_1.notificationService.remove((0, auth_middleware_1.currentUserId)(req), req.params.id)),
    clear: async (req, res) => res.json(await notification_service_1.notificationService.clear((0, auth_middleware_1.currentUserId)(req))),
    sounds: async (_req, res) => res.json({ sounds: await sound_service_1.soundService.list(), categories: sound_service_1.soundService.categories() }),
};
const parseEvents = (raw) => {
    if (Array.isArray(raw))
        return raw;
    if (typeof raw === 'string' && raw)
        return raw.split(',').map((s) => s.trim());
    return undefined;
};
/** Admin dashboard: notification tones and broadcasts. */
exports.notificationAdminController = {
    list: exports.notificationController.sounds,
    upload: async (req, res) => {
        const file = req.file;
        if (!file)
            throw (0, http_error_1.BadRequest)('Choose an audio file');
        if (!/^audio\//.test(file.mimetype)) {
            fs_1.default.rm(file.path, () => undefined);
            throw (0, http_error_1.BadRequest)('Only audio files (mp3, wav, ogg, m4a) can be used as notification sounds');
        }
        const sound = await sound_service_1.soundService.create(file, {
            name: req.body.name,
            events: parseEvents(req.body.events),
            isDefault: req.body.isDefault === 'true',
            volume: req.body.volume ? Number(req.body.volume) : undefined,
        });
        (0, audit_service_1.audit)(req, { action: 'sound.upload', targetType: 'sound', targetId: sound.id, details: { name: sound.name } });
        res.json(sound);
    },
    update: async (req, res) => {
        const sound = await sound_service_1.soundService.update(req.params.id, req.body);
        (0, audit_service_1.audit)(req, { action: 'sound.update', targetType: 'sound', targetId: sound.id, details: req.body });
        res.json(sound);
    },
    broadcast: async (req, res) => {
        const actor = await prisma_1.prisma.user.findUnique({ where: { id: req.userId }, select: { id: true, name: true } });
        const result = await notification_service_1.notificationService.broadcast({ ...req.body, actor: actor });
        (0, audit_service_1.audit)(req, { action: 'notification.broadcast', targetType: req.body.workspaceId ? 'workspace' : 'platform', targetId: req.body.workspaceId, details: { title: req.body.title, sent: result.sent } });
        res.json(result);
    },
    remove: async (req, res) => {
        await sound_service_1.soundService.remove(req.params.id);
        (0, audit_service_1.audit)(req, { action: 'sound.delete', targetType: 'sound', targetId: req.params.id });
        res.json({ ok: true });
    },
};
