import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden, HttpError, NotFound } from '../../core/errors/http-error';
import { AiProvider, anthropicProvider, explainPrompt, parseSuggestions, redact, suggestPrompt } from '../../shared/testapp/ai';
import { TestResult } from '../../shared/testapp/testing';
import { Bundle } from '../../shared/testapp/types';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

const today = () => {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};

let provider: AiProvider | null = null;
/** Tests/alternative providers can replace the provider. */
export const setAiProvider = (p: AiProvider | null) => (provider = p);
const getProvider = (): AiProvider => provider || anthropicProvider({ apiKey: env.ai.apiKey, model: env.ai.model });

async function authorize(userId: string, appId: string) {
  const app = await prisma.testApp.findUnique({ where: { id: appId } });
  if (!app) throw NotFound('Test app not found');
  const member = await assertWorkspaceMember(userId, app.workspaceId);
  if (member.role === 'viewer') throw Forbidden('Viewers cannot use the AI assistant');
  return app;
}

const assertEnabled = () => {
  if (!env.ai.enabled && !provider) throw new HttpError(503, 'The AI assistant is not enabled on this server.');
};

async function used(workspaceId: string) {
  return (await prisma.testAppAiUsage.findUnique({ where: { workspaceId_day: { workspaceId, day: today() } } }))?.tokens || 0;
}

async function complete(workspaceId: string, prompt: { system: string; user: string }, maxTokens: number) {
  if ((await used(workspaceId)) >= env.ai.dailyTokenBudget) throw new HttpError(429, 'The daily AI budget of this workspace is used up.');
  const out = await getProvider()({ ...prompt, maxTokens }).catch((e: Error) => {
    throw new HttpError(502, `AI provider error: ${e.message}`);
  });
  const tokens = out.inputTokens + out.outputTokens;
  await prisma.testAppAiUsage.upsert({ where: { workspaceId_day: { workspaceId, day: today() } }, create: { workspaceId, day: today(), tokens, calls: 1 }, update: { tokens: { increment: tokens }, calls: { increment: 1 } } });
  return out;
}

const bundleOf = (v: { model: unknown; contract: unknown; graph: unknown; schema: unknown; stats: unknown }) => ({ model: v.model, contract: v.contract, graph: v.graph, schema: v.schema, stats: v.stats }) as Bundle;

export const aiService = {
  async status(userId: string, appId: string) {
    const app = await authorize(userId, appId);
    return { enabled: env.ai.enabled || !!provider, model: env.ai.enabled ? env.ai.model : null, tokensUsedToday: await used(app.workspaceId), dailyTokenBudget: env.ai.dailyTokenBudget };
  },

  /** Suggestions are NOT saved or run. The user reviews them, then accepts into the app's custom tests. */
  async suggestTests(userId: string, appId: string) {
    assertEnabled();
    const app = await authorize(userId, appId);
    const v = await prisma.testAppVersion.findFirst({ where: { id: app.currentVersionId || undefined, testAppId: appId } });
    if (!v) throw NotFound('Nothing generated yet');
    const out = await complete(app.workspaceId, suggestPrompt(bundleOf(v)), 1800);
    const parsed = parseSuggestions(out.text, bundleOf(v));
    return { ...parsed, provenance: 'ai', note: 'AI suggestions: review before accepting. They are not verified findings.', tokens: out.inputTokens + out.outputTokens };
  },

  async explain(userId: string, appId: string, runId: string, testId: string) {
    assertEnabled();
    const app = await authorize(userId, appId);
    const run = await prisma.testRun.findUnique({ where: { id: runId } });
    if (!run || run.testAppId !== appId) throw NotFound('Run not found');
    const result = ((run.results || []) as unknown as TestResult[]).find((r) => r.id === testId);
    if (!result) throw NotFound('Test result not found');
    if (result.status === 'passed') throw BadRequest('This test passed; there is nothing to explain.');
    const out = await complete(app.workspaceId, explainPrompt(result), 400);
    return { explanation: out.text.trim().slice(0, 1500), provenance: 'ai', note: 'AI explanation based only on the recorded evidence. Not verified.', tokens: out.inputTokens + out.outputTokens, sent: redact({ name: result.name, error: result.error }) };
  },
};
