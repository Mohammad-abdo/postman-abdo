import { z } from 'zod';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { Conflict, HttpError, NotFound } from '../../core/errors/http-error';
import { seal, unseal } from '../../core/security/secret-box';
import { assertPublicUrl } from '../../core/security/safe-fetch';
import { AiProvider, anthropicProvider, geminiProvider, openaiProvider } from '../../shared/testapp/ai';

const MAX_KEYS = 10;
const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

const limit = z.number().int().min(1000).max(1_000_000_000).nullable();
/** Providers a key can belong to. `ai` ones power the AI assistant; "other" is an encrypted vault for any token. */
export const PROVIDERS = {
  anthropic: { name: 'Anthropic (Claude)', ai: true, model: '', pattern: /^sk-ant-[A-Za-z0-9_-]{20,300}$/, hint: 'it starts with sk-ant-' },
  openai: { name: 'OpenAI', ai: true, model: 'gpt-4o', pattern: /^sk-[A-Za-z0-9_-]{20,300}$/, hint: 'it starts with sk-' },
  gemini: { name: 'Google Gemini', ai: true, model: 'gemini-2.0-flash', pattern: /^[A-Za-z0-9_-]{20,200}$/, hint: 'it is 20+ letters, digits, - or _' },
  compatible: { name: 'OpenAI-compatible (OpenRouter, Groq, Mistral, DeepSeek, Ollama…)', ai: true, model: '', pattern: /^\S{8,500}$/, hint: 'no spaces, 8+ characters' },
  other: { name: 'Other token (stored safely)', ai: false, model: '', pattern: /^\S{4,2000}$/, hint: 'no spaces' },
} as const;
export type ProviderId = keyof typeof PROVIDERS;
const providerIds = Object.keys(PROVIDERS) as [ProviderId, ...ProviderId[]];
const httpUrl = z.string().trim().url().max(300).refine((u) => /^https?:\/\//i.test(u), 'Use an http(s) address');

export const createKeySchema = z
  .object({
    provider: z.enum(providerIds).default('anthropic'),
    label: z.string().trim().min(1).max(60),
    key: z.string().trim().min(4).max(2000),
    baseUrl: httpUrl.optional(),
    model: z.string().trim().min(1).max(80).optional(),
    dailyLimit: limit.optional(),
    totalLimit: limit.optional(),
  })
  .superRefine((v, ctx) => {
    const p = PROVIDERS[v.provider];
    if (!p.pattern.test(v.key)) ctx.addIssue({ code: 'custom', path: ['key'], message: `That does not look like a ${p.name.split(' (')[0]} key (${p.hint})` });
    if (v.provider === 'compatible' && (!v.baseUrl || !v.model)) ctx.addIssue({ code: 'custom', path: ['baseUrl'], message: 'An OpenAI-compatible key needs the endpoint address and a model name' });
    if (v.provider === 'other' && (v.dailyLimit || v.totalLimit)) ctx.addIssue({ code: 'custom', path: ['dailyLimit'], message: 'Usage limits only apply to AI keys' });
  });
export const updateKeySchema = z.object({ label: z.string().trim().min(1).max(60).optional(), active: z.boolean().optional(), dailyLimit: limit.optional(), totalLimit: limit.optional(), model: z.string().trim().min(1).max(80).nullable().optional() });

/** Builds the caller for a stored key. Custom endpoints are checked for private addresses every time. */
export async function providerFor(row: { provider: string; baseUrl: string | null; model: string | null }, apiKey: string, anthropicModel?: string): Promise<AiProvider> {
  if (row.provider === 'openai') return openaiProvider({ apiKey, model: row.model || PROVIDERS.openai.model });
  if (row.provider === 'gemini') return geminiProvider({ apiKey, model: row.model || PROVIDERS.gemini.model });
  if (row.provider === 'compatible') {
    await assertPublicUrl(row.baseUrl || '');
    return openaiProvider({ apiKey, model: row.model || '', baseUrl: row.baseUrl || '' });
  }
  return anthropicProvider({ apiKey, model: row.model || anthropicModel || env.ai.model, baseUrl: env.ai.baseUrl });
}

type Row = Awaited<ReturnType<typeof prisma.userApiKey.findMany>>[number];
const usedTodayOf = (r: Pick<Row, 'usedDay' | 'usedToday'>) => (r.usedDay && r.usedDay.getTime() === today().getTime() ? r.usedToday : 0);

/** Why a key cannot be used right now, or null when it can. */
export const blockedReason = (r: Pick<Row, 'active' | 'dailyLimit' | 'totalLimit' | 'usedDay' | 'usedToday' | 'totalUsed'>) =>
  !r.active ? 'off' : r.dailyLimit != null && usedTodayOf(r) >= r.dailyLimit ? 'daily-limit' : r.totalLimit != null && r.totalUsed >= r.totalLimit ? 'total-limit' : null;

const view = (r: Row) => ({
  id: r.id,
  provider: r.provider,
  providerName: PROVIDERS[r.provider as ProviderId]?.name ?? r.provider,
  ai: PROVIDERS[r.provider as ProviderId]?.ai ?? false,
  baseUrl: r.baseUrl,
  model: r.model,
  label: r.label,
  masked: `••••${r.last4}`,
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
    if (input.provider === 'compatible') await assertPublicUrl(input.baseUrl!);
    const row = await prisma.userApiKey.create({ data: { userId, provider: input.provider, label: input.label, secret: seal(input.key), last4: input.key.slice(-4), baseUrl: input.provider === 'compatible' ? input.baseUrl! : null, model: input.model ?? null, dailyLimit: input.dailyLimit ?? null, totalLimit: input.totalLimit ?? null } });
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
    if (input.model !== undefined) data.model = input.model;
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
    if (!PROVIDERS[row.provider as ProviderId]?.ai) throw new HttpError(400, 'This token is only stored. There is nothing to test it against.');
    try {
      const out = await (await providerFor(row, unseal(row.secret), env.ai.fastModel))({ system: 'Reply with the single word ok.', user: 'ping', maxTokens: 8 });
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
    const rows = await prisma.userApiKey.findMany({ where: { userId, active: true, provider: { in: ['anthropic', 'openai', 'gemini', 'compatible'] } }, orderBy: { createdAt: 'asc' } });
    const row = rows.find((r) => !blockedReason(r));
    if (!row) return null;
    try {
      return { id: row.id, label: row.label, key: unseal(row.secret), provider: row.provider, baseUrl: row.baseUrl, model: row.model };
    } catch {
      await prisma.userApiKey.update({ where: { id: row.id }, data: { active: false, lastError: 'Could not be decrypted (server secret changed). Add the key again.' } });
      return null;
    }
  },

  /** The stored token itself, for the owner only (vault tokens), so it can be copied back out. */
  async reveal(userId: string, id: string) {
    const row = await owned(userId, id);
    if (row.provider !== 'other') throw new HttpError(400, 'AI keys cannot be shown again. Add a new one if you lost it.');
    return { key: unseal(row.secret) };
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
