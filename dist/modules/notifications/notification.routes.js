"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.soundFileRoutes = exports.broadcastAdminRoutes = exports.soundAdminRoutes = exports.notificationRoutes = void 0;
const crypto_1 = require("crypto");
const express_1 = __importStar(require("express"));
const multer_1 = __importDefault(require("multer"));
const path_1 = __importDefault(require("path"));
const zod_1 = require("zod");
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const validate_middleware_1 = require("../../core/middleware/validate.middleware");
const notification_controller_1 = require("./notification.controller");
const notification_types_1 = require("./notification.types");
const sound_service_1 = require("./sound.service");
const MAX_SOUND_BYTES = 2 * 1024 * 1024;
exports.notificationRoutes = (0, express_1.Router)();
exports.notificationRoutes.get('/', notification_controller_1.notificationController.list);
exports.notificationRoutes.get('/unread-count', notification_controller_1.notificationController.unreadCount);
exports.notificationRoutes.get('/sounds', notification_controller_1.notificationController.sounds);
exports.notificationRoutes.post('/read', (0, validate_middleware_1.validateBody)(zod_1.z.object({ ids: zod_1.z.array(zod_1.z.string()).optional() })), notification_controller_1.notificationController.markRead);
exports.notificationRoutes.delete('/', notification_controller_1.notificationController.clear);
exports.notificationRoutes.delete('/:id', notification_controller_1.notificationController.remove);
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: sound_service_1.SOUNDS_DIR,
        filename: (_req, file, cb) => cb(null, `${(0, crypto_1.randomUUID)()}${path_1.default.extname(file.originalname).toLowerCase().replace(/[^.\w]/g, '')}`),
    }),
    limits: { fileSize: MAX_SOUND_BYTES },
});
const soundUpdateSchema = zod_1.z.object({
    name: zod_1.z.string().trim().min(1).max(80).optional(),
    events: zod_1.z.array(zod_1.z.enum(Object.keys(notification_types_1.NOTIFICATION_CATEGORIES))).optional(),
    isDefault: zod_1.z.boolean().optional(),
    volume: zod_1.z.number().min(0).max(1).optional(),
});
/** Mounted at /api/admin/sounds. */
exports.soundAdminRoutes = (0, express_1.Router)();
exports.soundAdminRoutes.use(auth_middleware_1.requireStaff, (0, auth_middleware_1.requirePermission)('notifications.manage'));
exports.soundAdminRoutes.get('/', notification_controller_1.notificationAdminController.list);
exports.soundAdminRoutes.post('/', upload.single('file'), notification_controller_1.notificationAdminController.upload);
exports.soundAdminRoutes.put('/:id', (0, validate_middleware_1.validateBody)(soundUpdateSchema), notification_controller_1.notificationAdminController.update);
exports.soundAdminRoutes.delete('/:id', notification_controller_1.notificationAdminController.remove);
const broadcastSchema = zod_1.z.object({
    title: zod_1.z.string().trim().min(1).max(160),
    body: zod_1.z.string().trim().max(2000).optional(),
    workspaceId: zod_1.z.string().optional(),
});
/** Mounted at /api/admin/broadcast. */
exports.broadcastAdminRoutes = (0, express_1.Router)();
exports.broadcastAdminRoutes.use(auth_middleware_1.requireStaff, (0, auth_middleware_1.requirePermission)('notifications.manage'));
exports.broadcastAdminRoutes.post('/', (0, validate_middleware_1.validateBody)(broadcastSchema), notification_controller_1.notificationAdminController.broadcast);
/** Public, cacheable tone files for <audio> elements. */
exports.soundFileRoutes = express_1.default.static(sound_service_1.SOUNDS_DIR, { maxAge: '7d', immutable: true, fallthrough: false });
