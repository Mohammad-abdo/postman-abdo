import { cache, cacheKeys } from '../../core/cache/cache.service';
import { json, prisma } from '../../core/database/prisma';

/** Limits applied to every user unless overridden per user (User.limits) or per workspace (memberLimit). */
export interface Limits {
  maxWorkspaces: number;
  maxMembersPerWorkspace: number;
  maxProjectsPerWorkspace: number;
  maxCollectionsPerWorkspace: number;
  maxRequestsPerDay: number;
  maxUploadMb: number;
  maxStorageMb: number;
  maxMonitors: number;
  maxMockServers: number;
}

export interface PlatformSettings {
  registrationOpen: boolean;
  maintenanceMode: boolean;
  /** Banner shown to every signed-in user (empty = none). */
  announcement: string;
  defaultLimits: Limits;
}

export const DEFAULT_SETTINGS: PlatformSettings = {
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

export const platformService = {
  async settings(): Promise<PlatformSettings> {
    return cache.wrap(cacheKeys.settings(), 60, async () => {
      const row = await prisma.platformSetting.findUnique({ where: { key: SETTINGS_KEY } });
      const stored = (row?.value as Partial<PlatformSettings>) || {};
      return { ...DEFAULT_SETTINGS, ...stored, defaultLimits: { ...DEFAULT_SETTINGS.defaultLimits, ...(stored.defaultLimits || {}) } };
    });
  },

  async update(patch: Partial<PlatformSettings>) {
    const current = await this.settings();
    const next = { ...current, ...patch, defaultLimits: { ...current.defaultLimits, ...(patch.defaultLimits || {}) } };
    await prisma.platformSetting.upsert({ where: { key: SETTINGS_KEY }, create: { key: SETTINGS_KEY, value: json(next) }, update: { value: json(next) } });
    await cache.invalidate(cacheKeys.settings());
    return next;
  },

  /** What signed-in clients may see (no internal defaults). */
  async publicSettings() {
    const s = await this.settings();
    return { registrationOpen: s.registrationOpen, maintenanceMode: s.maintenanceMode, announcement: s.announcement };
  },
};
