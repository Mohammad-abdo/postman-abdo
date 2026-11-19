"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.platformService = exports.DEFAULT_SETTINGS = void 0;
const cache_service_1 = require("../../core/cache/cache.service");
const prisma_1 = require("../../core/database/prisma");
exports.DEFAULT_SETTINGS = {
    registrationOpen: true,
    maintenanceMode: false,
    announcement: '',
    defaultLimits: {
        maxWorkspaces: 10,
        maxMembersPerWorkspace: 25,
        maxProjectsPerWorkspace: 20,
        maxCollectionsPerWorkspace: 100,
        maxRequestsPerDay: 5000,
        maxUploadMb: 20,
        maxStorageMb: 200,
        maxMonitors: 5,
        maxMockServers: 5,
    },
};
const SETTINGS_KEY = 'platform';
exports.platformService = {
    async settings() {
        return cache_service_1.cache.wrap(cache_service_1.cacheKeys.settings(), 60, async () => {
            const row = await prisma_1.prisma.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
            const stored = row?.value || {};
            return { ...exports.DEFAULT_SETTINGS, ...stored, defaultLimits: { ...exports.DEFAULT_SETTINGS.defaultLimits, ...(stored.defaultLimits || {}) } };
        });
    },
    async update(patch) {
        const current = await this.settings();
        const next = { ...current, ...patch, defaultLimits: { ...current.defaultLimits, ...(patch.defaultLimits || {}) } };
        await prisma_1.prisma.platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: (0, prisma_1.json)(next) }, update: { value: (0, prisma_1.json)(next) } });
        await cache_service_1.cache.invalidate(cache_service_1.cacheKeys.settings());
        return next;
    },
    /** What signed-in clients may see (no internal defaults). */
    async publicSettings() {
        const s = await this.settings();
        return { registrationOpen: s.registrationOpen, maintenanceMode: s.maintenanceMode, announcement: s.announcement };
    },
};
