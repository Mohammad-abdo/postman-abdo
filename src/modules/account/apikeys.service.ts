import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { Conflict, HttpError, NotFound } from '../../core/errors/http-error';
import { seal, unseal } from '../../core/security/secret-box';
import { anthropicProvider } from '../../shared/testapp/ai';

const MAX_KEYS = 10;
const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const limit = z.number().int().min(1000).max(1_000_000_000).nullable();
export const createKeySchema = z.object({
  label: z.string().trim().min(1).max(60),
  key: z.string().trim().regex(/^sk-ant-[A-Za-z0-9_-]{20,300}$/, 'That does not look like an Anthropic API key (it starts with sk-ant-)'),
  dailyLimit: limit.optional(),
  totalLimit: limit.optional(),
});
export const updateKeySchema = z.object({ label: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional(), dailyLimit: limit.optional(), totalLimit: limit.optional() });

type Row = Awaited<ReturnType<typeof prisma.userApiKey.findMany>>[number];
const usedTodayOf = (r: Pick<Row, 'usedDay' | 'usedToday'>) => (r.usedDay && r.usedDay.getTime() === today().getTime() ? r.usedToday : 0);

/** Why a key cannot be used right now, or null when it can. */
export const blockedReason = (r: Pick<Row, 'active' | 'dailyLimit' | 'totalLimit' | 'usedDay' | 'usedToday' | 'totalUsed'>) =>
  !r.active ? 'off' : r.dailyLimit != null && usedTodayOf(r) >= r.dailyLimit ? 'daily-limit' : r.totalLimit != null && r.totalUsed >= r.totalLimit ? 'total-limit' : null;

const view = (r: Row) => ({
  id: r.id,
  provider: r.provider,
  label: r.label,
  masked: `sk-ant-••••${r.last4}`,
  active: r.active,
  dailyLimit: r.dailyLimit,
  totalLimit: r.totalLimit,
  usedToday: usedTodayOf(r),
  totalUsed: r.totalUsed,
  calls: r.calls,
  lastUsedAt: r.lastUsedAt,
  lastError: r.lastError,
  status: blockedReason(r) ?? 'ready',
  createdAt: r.createdAt,
});

const owned = async (userId: string, id: string) => {
  const row = await prisma.userApiKey.findFirst({ where: { id, userId } });
  if (!row) throw NotFound('API key not found');
  return row;
};

/** AI usage for the usage page: per feature and who paid, plus a daily series. */
export async function aiUsage(userId: string, days: number) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await prisma.aiUsageDaily.findMany({ where: { userId, day: { gte: since } }, orderBy: { day: 'asc' }, take: 5000 });
  const byFeature = new Map<string, { feature: string; own: number; platform: number; calls: number }>();
  const daily = new Map<string, number>();
  let own = 0;
  let platform = 0;
  for (const r of rows) {
    const f = byFeature.get(r.feature) || { feature: r.feature, own: 0, platform: 0, calls: 0 };
    if (r.source === 'own') (f.own += r.tokens), (own += r.tokens);
    else (f.platform += r.tokens), (platform += r.tokens);
    f.calls += r.calls;
    byFeature.set(r.feature, f);
    const k = r.day.toISOString().slice(0, 10);
    daily.set(k, (daily.get(k) || 0) + r.tokens);
  }
  return { days, totals: { own, platform, calls: [...byFeature.values()].reduce((n, f) => n + f.calls, 0) }, features: [...byFeature.values()].sort((a, b) => b.own + b.platform - (a.own + a.platform)), daily: [...daily].map(([day, tokens]) => ({ day, tokens })) };
}

export const apiKeysService = {
  async list(userId: string) {
    return (await prisma.userApiKey.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })).map(view);
  },

  async create(userId: string, input: z.infer<typeof createKeySchema>) {
    if ((await prisma.userApiKey.count({ where: { userId } })) >= MAX_KEYS) throw Conflict(`You can store up to ${MAX_KEYS} keys.`);
    const row = await prisma.userApiKey.create({ data: { userId, label: input.label, secret: seal(input.key), last4: input.key.slice(-4), dailyLimit: input.dailyLimit ?? null, totalLimit: input.totalLimit ?? null } });
    return view(row);
  },

  async update(userId: string, id: string, input: z.infer<typeof updateKeySchema>) {
    await owned(userId, id);
    const data: Record<string, unknown> = {};
    if (input.label !== undefined) data.label = input.label;
    if (input.active !== undefined) {
      data.active = input.active;
      if (input.active) data.lastError = null;
    }
    if (input.dailyLimit !== undefined) data.dailyLimit = input.dailyLimit;
    if (input.totalLimit !== undefined) data.totalLimit = input.totalLimit;
    return view(await prisma.userApiKey.update({ where: { id }, data }));
  },

  async remove(userId: string, id: string) {
    await owned(userId, id);
    await prisma.userApiKey.delete({ where: { id } });
    return { ok: true };
  },

  /** One tiny request to check that the key works. Counted against the key like any other call. */
  async test(userId: string, id: string) {
    const row = await owned(userId, id);
    try {
      const out = await anthropicProvider({ apiKey: unseal(row.secret), model: env.ai.fastModel, baseUrl: env.ai.baseUrl })({ system: 'Reply with the single word ok.', user: 'ping', maxTokens: 8 });
      await apiKeysService.record(id, out.inputTokens + out.outputTokens);
      return { ok: true };
    } catch (e) {
      const message = (e as Error).message.slice(0, 190);
      await prisma.userApiKey.update({ where: { id }, data: { lastError: message } });
      throw new HttpError(422, `The key did not work: ${message}`);
    }
  },

  /** The person's first usable key (oldest first), decrypted for one request. Null when they have none to use. */
  async pick(userId: string) {
    const rows = await prisma.userApiKey.findMany({ where: { userId, active: true, provider: 'anthropic' }, orderBy: { createdAt: 'asc' } });
    const row = rows.find((r) => !blockedReason(r));
    if (!row) return null;
    try {
      return { id: row.id, label: row.label, key: unseal(row.secret) };
    } catch {
      await prisma.userApiKey.update({ where: { id: row.id }, data: { active: false, lastError: 'Could not be decrypted (server secret changed). Add the key again.' } });
      return null;
    }
  },

  /** Adds usage atomically (a new day starts from zero on its own). */
  async record(id: string, tokens: number) {
    const date = today();
    await prisma.$executeRaw`UPDATE UserApiKey SET usedToday = IF(usedDay = ${date}, usedToday + ${tokens}, ${tokens}), usedDay = ${date}, totalUsed = totalUsed + ${tokens}, calls = calls + 1, lastUsedAt = NOW(), lastError = NULL WHERE id = ${id}`;
  },

  /** A failed call: remember why, and switch the key off when the provider rejects it outright. */
  async fail(id: string, message: string, disable: boolean) {
    await prisma.userApiKey.update({ where: { id }, data: { lastError: message.slice(0, 190), ...(disable ? { active: false } : {}) } });
  },
};
