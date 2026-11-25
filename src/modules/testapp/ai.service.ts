import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden, HttpError, NotFound } from '../../core/errors/http-error';
import { AiArgs, AiProvider, anthropicProvider, explainPrompt, parseSuggestions, redact, suggestPrompt } from '../../shared/testapp/ai';
import { Customization, customizationSchema } from '../../shared/testapp/design/customize';
import { DesignMode, Proposal, designPrompt, parseImage, designTool, parseProposals, parseReview, reviewPrompt, reviewTool } from '../../shared/testapp/ai-design';
import { TestResult } from '../../shared/testapp/testing';
import { Bundle } from '../../shared/testapp/types';
import { apiKeysService } from '../account/apikeys.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

let provider: AiProvider | null = null;
/** Tests/alternative providers can replace the provider. */
export const setAiProvider = (p: AiProvider | null) => (provider = p);
const getProvider = (): AiProvider => provider || anthropicProvider({ apiKey: env.ai.apiKey, model: env.ai.model, baseUrl: env.ai.baseUrl });

async function authorize(userId: string, appId: string) {
  const app = await prisma.testApp.findUnique({ where: { id: appId } });
  if (!app) throw NotFound('Test app not found');
  const member = await assertWorkspaceMember(userId, app.workspaceId);
  if (member.role === 'viewer') throw Forbidden('Viewers cannot use the AI assistant');
  return app;
}

const assertEnabled = async (userId: string) => {
  if (env.ai.enabled || provider) return;
  if (!(await apiKeysService.pick(userId))) throw new HttpError(503, 'The AI assistant is not enabled on this server. Add your own Anthropic API key under Account, API keys to use it.');
};

async function used(workspaceId: string) {
  return (await prisma.testAppAiUsage.findUnique({ where: { workspaceId_day: { workspaceId, day: today() } } }))?.tokens || 0;
}

async function userUsed(userId: string) {
  return (await prisma.testAppAiUserUsage.findUnique({ where: { userId_day: { userId, day: today() } } }))?.tokens || 0;
}

/** The person's own key runs the request when they have a usable one: their money, their limits, none of the platform budgets. */
async function viaOwnKey(own: { id: string; label: string; key: string }, prompt: { system: string; user: string }, maxTokens: number, extra: Pick<AiArgs, 'tool' | 'model' | 'images'>) {
  try {
    const out = await anthropicProvider({ apiKey: own.key, model: env.ai.model, baseUrl: env.ai.baseUrl })({ ...prompt, maxTokens, ...extra });
    await apiKeysService.record(own.id, out.inputTokens + out.outputTokens);
    return out;
  } catch (e) {
    const message = (e as Error).message;
    const rejected = /returned (401|403)/.test(message);
    await apiKeysService.fail(own.id, message, rejected);
    throw new HttpError(502, rejected ? `Your key "${own.label}" was rejected and has been switched off.` : `Your key "${own.label}" failed: ${message}`);
  }
}

async function complete(workspaceId: string, userId: string, prompt: { system: string; user: string }, maxTokens: number, extra: Pick<AiArgs, 'tool' | 'model' | 'images'> = {}) {
  const own = provider ? null : await apiKeysService.pick(userId);
  if (own) return viaOwnKey(own, prompt, maxTokens, extra);
  if ((await used(workspaceId)) >= env.ai.dailyTokenBudget) throw new HttpError(429, 'The daily AI budget of this workspace is used up.');
  if ((await userUsed(userId)) >= env.ai.userDailyTokens) throw new HttpError(429, 'You have used your daily AI allowance. It resets at midnight UTC.');
  const out = await getProvider()({ ...prompt, maxTokens, ...extra }).catch((e: Error) => {
    throw new HttpError(502, `AI provider error: ${e.message}`);
  });
  const tokens = out.inputTokens + out.outputTokens;
  await prisma.testAppAiUsage.upsert({ where: { workspaceId_day: { workspaceId, day: today() } }, create: { workspaceId, day: today(), tokens, calls: 1 }, update: { tokens: { increment: tokens }, calls: { increment: 1 } } });
  await prisma.$executeRaw`INSERT INTO TestAppAiUserUsage (id, userId, day, tokens) VALUES (UUID(), ${userId}, ${today()}, ${tokens}) ON DUPLICATE KEY UPDATE tokens = tokens + ${tokens}`;
  return out;
}

const currentOf = (raw: unknown): Customization | null => {
  if (raw == null) return null;
  const r = customizationSchema.safeParse(raw);
  if (!r.success) throw BadRequest(`The current design is invalid: ${r.error.issues[0]?.message}`);
  return r.data;
};

async function loadBundle(appId: string) {
  const app = await prisma.testApp.findUnique({ where: { id: appId } });
  const v = await prisma.testAppVersion.findFirst({ where: { id: app?.currentVersionId || undefined, testAppId: appId } });
  if (!v) throw NotFound('Nothing generated yet');
  return bundleOf(v);
}

const bundleOf = (v: { model: unknown; contract: unknown; graph: unknown; schema: unknown; stats: unknown }) => ({ model: v.model, contract: v.contract, graph: v.graph, schema: v.schema, stats: v.stats }) as Bundle;

export const aiService = {
  async status(userId: string, appId: string) {
    const app = await authorize(userId, appId);
    const own = await apiKeysService.pick(userId);
    return { enabled: env.ai.enabled || !!provider || !!own, source: own ? 'own' : 'platform', ownKey: own?.label ?? null, model: env.ai.model, tokensUsedToday: await used(app.workspaceId), dailyTokenBudget: env.ai.dailyTokenBudget, yourTokensToday: await userUsed(userId), yourDailyAllowance: env.ai.userDailyTokens };
  },

  /** Suggestions are NOT saved or run. The user reviews them, then accepts into the app's custom tests. */
  async suggestTests(userId: string, appId: string) {
    await assertEnabled(userId);
    const app = await authorize(userId, appId);
    const v = await prisma.testAppVersion.findFirst({ where: { id: app.currentVersionId || undefined, testAppId: appId } });
    if (!v) throw NotFound('Nothing generated yet');
    const out = await complete(app.workspaceId, userId, suggestPrompt(bundleOf(v)), 1800);
    const parsed = parseSuggestions(out.text, bundleOf(v));
    return { ...parsed, provenance: 'ai', note: 'AI suggestions: review before accepting. They are not verified findings.', tokens: out.inputTokens + out.outputTokens };
  },

  async explain(userId: string, appId: string, runId: string, testId: string) {
    await assertEnabled(userId);
    const app = await authorize(userId, appId);
    const run = await prisma.testRun.findUnique({ where: { id: runId } });
    if (!run || run.testAppId !== appId) throw NotFound('Run not found');
    const result = ((run.results || []) as unknown as TestResult[]).find((r) => r.id === testId);
    if (!result) throw NotFound('Test result not found');
    if (result.status === 'passed') throw BadRequest('This test passed; there is nothing to explain.');
    const out = await complete(app.workspaceId, userId, explainPrompt(result), 400);
    return { explanation: out.text.trim().slice(0, 1500), provenance: 'ai', note: 'AI explanation based only on the recorded evidence. Not verified.', tokens: out.inputTokens + out.outputTokens, sent: redact({ name: result.name, error: result.error }) };
  },

  /** Proposes design changes (1 option, or 3 for a redesign). Nothing is saved: the studio previews and the user applies. */
  async design(userId: string, appId: string, input: { mode: DesignMode; prompt: string; current?: unknown; focus?: string; image?: string }) {
    await assertEnabled(userId);
    const app = await authorize(userId, appId);
    const bundle = await loadBundle(appId);
    const current = currentOf(input.current);
    const count = input.mode === 'redesign' ? 3 : 1;
    const model = input.mode === 'text' ? env.ai.fastModel : undefined; // short text jobs run on the cheaper model
    const image = parseImage(input.image);
    if (input.image && !image) throw BadRequest('The reference image must be a png, jpeg or webp.');
    const images = image ? [image] : undefined;
    const prompt = designPrompt(bundle, current, input.mode, input.prompt, input.focus, !!image);
    let tokens = 0;
    let out = await complete(app.workspaceId, userId, prompt, 6000, { tool: designTool(count), model, images });
    tokens += out.inputTokens + out.outputTokens;
    let parsed = parseProposals(out.toolInput, current);
    if (!parsed.proposals.length) {
      // One self-repair round: tell the model exactly what was rejected.
      const retry = [prompt.user, '', 'Your previous reply was rejected:', ...parsed.errors, 'Fix these problems and reply again.'].join('\n');
      out = await complete(app.workspaceId, userId, { system: prompt.system, user: retry }, 6000, { tool: designTool(count), model, images });
      tokens += out.inputTokens + out.outputTokens;
      parsed = parseProposals(out.toolInput, current);
    }
    if (!parsed.proposals.length) throw new HttpError(422, `The AI could not produce a valid design change. ${parsed.errors[0] || ''}`.trim());
    return { proposals: parsed.proposals as Proposal[], rejected: parsed.errors, provenance: 'ai', note: 'AI suggestion: preview it, then apply or reject.', tokens };
  },

  /** Reviews the design and lists problems, each with a one-sentence fix instruction the studio can send back to `design`. */
  async review(userId: string, appId: string, current: unknown) {
    await assertEnabled(userId);
    const app = await authorize(userId, appId);
    const bundle = await loadBundle(appId);
    const out = await complete(app.workspaceId, userId, reviewPrompt(bundle, currentOf(current)), 3000, { tool: reviewTool });
    const review = parseReview(out.toolInput);
    if (!review) throw new HttpError(422, 'The AI review could not be read. Try again.');
    return { ...review, provenance: 'ai', note: 'AI review: opinions, not verified findings.', tokens: out.inputTokens + out.outputTokens };
  },
};
