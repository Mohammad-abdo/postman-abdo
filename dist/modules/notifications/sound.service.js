"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.soundService = exports.SOUNDS_DIR = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../config/env");
const cache_service_1 = require("../../core/cache/cache.service");
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const notification_types_1 = require("./notification.types");
exports.SOUNDS_DIR = path_1.default.join(env_1.env.uploadDir, 'sounds');
fs_1.default.mkdirSync(exports.SOUNDS_DIR, { recursive: true });
const CACHE_KEY = 'notifications:sounds';
const toView = (s) => ({
    id: s.id,
    name: s.name,
    url: `/sounds/${s.storedName}`,
    mimeType: s.mimeType,
    size: s.size,
    events: s.events || [],
    isDefault: s.isDefault,
    volume: s.volume,
    createdAt: s.createdAt,
});
const validEvents = (events) => (events || []).filter((e) => e in notification_types_1.NOTIFICATION_CATEGORIES);
/** Only one default tone; it plays for categories without a dedicated tone. */
async function clearOtherDefaults(id) {
    await prisma_1.prisma.notificationSound.updateMany({ where: { id: { not: id }, isDefault: true }, data: { isDefault: false } });
}
exports.soundService = {
    /** Tones every client loads to decide what to play for each category. */
    list() {
        return cache_service_1.cache.wrap(CACHE_KEY, 300, async () => (await prisma_1.prisma.notificationSound.findMany({ orderBy: { createdAt: 'asc' } })).map(toView));
    },
    categories: () => Object.entries(notification_types_1.NOTIFICATION_CATEGORIES).map(([key, label]) => ({ key, label })),
    async create(file, input) {
        const sound = await prisma_1.prisma.notificationSound.create({
            data: {
                name: input.name || path_1.default.parse(file.originalname).name,
                storedName: file.filename,
                mimeType: file.mimetype,
                size: file.size,
                events: (0, prisma_1.json)(validEvents(input.events)),
                isDefault: !!input.isDefault || (await prisma_1.prisma.notificationSound.count()) === 0,
                volume: input.volume ?? 0.8,
            },
        });
        if (sound.isDefault)
            await clearOtherDefaults(sound.id);
        await cache_service_1.cache.invalidate(CACHE_KEY);
        return toView(sound);
    },
    async update(id, input) {
        const sound = await prisma_1.prisma.notificationSound.update({
            where: { id },
            data: {
                ...(input.name ? { name: input.name } : {}),
                ...(input.events ? { events: (0, prisma_1.json)(validEvents(input.events)) } : {}),
                ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
                ...(input.volume !== undefined ? { volume: input.volume } : {}),
            },
        });
        if (sound.isDefault)
            await clearOtherDefaults(sound.id);
        await cache_service_1.cache.invalidate(CACHE_KEY);
        return toView(sound);
    },
    async remove(id) {
        const sound = await prisma_1.prisma.notificationSound.findUnique({ where: { id } });
        if (!sound)
            throw (0, http_error_1.NotFound)('Sound not found');
        await prisma_1.prisma.notificationSound.delete({ where: { id } });
        fs_1.default.rm(path_1.default.join(exports.SOUNDS_DIR, sound.storedName), () => undefined);
        await cache_service_1.cache.invalidate(CACHE_KEY);
    },
};
