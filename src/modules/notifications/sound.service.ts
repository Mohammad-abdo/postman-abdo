import fs from 'fs';
import path from 'path';
import { env } from '../../config/env';
import { cache } from '../../core/cache/cache.service';
import { json, prisma } from '../../core/database/prisma';
import { NotFound } from '../../core/errors/http-error';
import { NOTIFICATION_CATEGORIES, NotificationCategory } from './notification.types';

export const SOUNDS_DIR = path.join(env.uploadDir, 'sounds');
fs.mkdirSync(SOUNDS_DIR, { recursive: true });

const CACHE_KEY = 'notifications:sounds';

export interface SoundInput {
  name?: string;
  events?: NotificationCategory[];
  isDefault?: boolean;
  volume?: number;
}

const toView = (s: { id: string; name: string; storedName: string; mimeType: string; size: number; events: unknown; isDefault: boolean; volume: number; createdAt: Date }) => ({
  id: s.id,
  name: s.name,
  url: `/sounds/${s.storedName}`,
  mimeType: s.mimeType,
  size: s.size,
  events: (s.events as NotificationCategory[]) || [],
  isDefault: s.isDefault,
  volume: s.volume,
  createdAt: s.createdAt,
});

const validEvents = (events?: string[]) => (events || []).filter((e): e is NotificationCategory => e in NOTIFICATION_CATEGORIES);

/** Only one default tone; it plays for categories without a dedicated tone. */
async function clearOtherDefaults(id: string) {
  await prisma.notificationSound.updateMany({ where: { id: { not: id }, isDefault: true }, data: { isDefault: false } });
}

export const soundService = {
  /** Tones every client loads to decide what to play for each category. */
  list() {
    return cache.wrap(CACHE_KEY, 300, async () => (await prisma.notificationSound.findMany({ orderBy: { createdAt: 'asc' } })).map(toView));
  },

  categories: () => Object.entries(NOTIFICATION_CATEGORIES).map(([key, label]) => ({ key, label })),

  async create(file: Express.Multer.File, input: SoundInput) {
    const sound = await prisma.notificationSound.create({
      data: {
        name: input.name || path.parse(file.originalname).name,
        storedName: file.filename,
        mimeType: file.mimetype,
        size: file.size,
        events: json(validEvents(input.events)),
        isDefault: !!input.isDefault || (await prisma.notificationSound.count()) === 0,
        volume: input.volume ?? 0.8,
      },
    });
    if (sound.isDefault) await clearOtherDefaults(sound.id);
    await cache.invalidate(CACHE_KEY);
    return toView(sound);
  },

  async update(id: string, input: SoundInput) {
    const sound = await prisma.notificationSound.update({
      where: { id },
      data: {
        ...(input.name ? { name: input.name } : {}),
        ...(input.events ? { events: json(validEvents(input.events)) } : {}),
        ...(input.isDefault !== undefined ? { isDefault: input.isDefault } : {}),
        ...(input.volume !== undefined ? { volume: input.volume } : {}),
      },
    });
    if (sound.isDefault) await clearOtherDefaults(sound.id);
    await cache.invalidate(CACHE_KEY);
    return toView(sound);
  },

  async remove(id: string) {
    const sound = await prisma.notificationSound.findUnique({ where: { id } });
    if (!sound) throw NotFound('Sound not found');
    await prisma.notificationSound.delete({ where: { id } });
    fs.rm(path.join(SOUNDS_DIR, sound.storedName), () => undefined);
    await cache.invalidate(CACHE_KEY);
  },
};
