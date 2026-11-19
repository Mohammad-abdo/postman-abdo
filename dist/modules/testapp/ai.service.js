"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.aiService = exports.setAiProvider = void 0;
const env_1 = require("../../config/env");
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const ai_1 = require("../../shared/testapp/ai");
const workspace_access_1 = require("../workspaces/workspace.access");
const today = () => {
    const d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
};
let provider = null;
/** Tests/alternative providers can replace the provider. */
const setAiProvider = (p) => (provider = p);
exports.setAiProvider = setAiProvider;
const getProvider = () => provider || (0, ai_1.anthropicProvider)({ apiKey: env_1.env.ai.apiKey, model: env_1.env.ai.model });
async function authorize(userId, appId) {
    const app = await prisma_1.prisma.testApp.findUnique({ where: { id: appId } });
    if (!app)
        throw (0, http_error_1.NotFound)('Test app not found');
    const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, app.workspaceId);
    if (member.role === 'viewer')
        throw (0, http_error_1.Forbidden)('Viewers cannot use the AI assistant');
    return app;
}
const assertEnabled = () => {
    if (!env_1.env.ai.enabled && !provider)
        throw new http_error_1.HttpError(503, 'The AI assistant is not enabled on this server.');
};
async function used(workspaceId) {
    return (await prisma_1.prisma.testAppAiUsage.findUnique({ where: { workspaceId_day: { workspaceId, day: today() } } }))?.tokens || 0;
}
async function complete(workspaceId, prompt, maxTokens) {
    if ((await used(workspaceId)) >= env_1.env.ai.dailyTokenBudget)
        throw new http_error_1.HttpError(429, 'The daily AI budget of this workspace is used up.');
    const out = await getProvider()({ ...prompt, maxTokens }).catch((e) => {
        throw new http_error_1.HttpError(502, `AI provider error: ${e.message}`);
    });
    const tokens = out.inputTokens + out.outputTokens;
    await prisma_1.prisma.testAppAiUsage.upsert({ where: { workspaceId_day: { workspaceId, day: today() } }, create: { workspaceId, day: today(), tokens, calls: 1 }, update: { tokens: { increment: tokens }, calls: { increment: 1 } } });
    return out;
}
const bundleOf = (v) => ({ model: v.model, contract: v.contract, graph: v.graph, schema: v.schema, stats: v.stats });
exports.aiService = {
    async status(userId, appId) {
        const app = await authorize(userId, appId);
        return { enabled: env_1.env.ai.enabled || !!provider, model: env_1.env.ai.enabled ? env_1.env.ai.model : null, tokensUsedToday: await used(app.workspaceId), dailyTokenBudget: env_1.env.ai.dailyTokenBudget };
    },
    /** Suggestions are NOT saved or run. The user reviews them, then accepts into the app's custom tests. */
    async suggestTests(userId, appId) {
        assertEnabled();
        const app = await authorize(userId, appId);
        const v = await prisma_1.prisma.testAppVersion.findFirst({ where: { id: app.currentVersionId || undefined, testAppId: appId } });
        if (!v)
            throw (0, http_error_1.NotFound)('Nothing generated yet');
        const out = await complete(app.workspaceId, (0, ai_1.suggestPrompt)(bundleOf(v)), 1800);
        const parsed = (0, ai_1.parseSuggestions)(out.text, bundleOf(v));
        return { ...parsed, provenance: 'ai', note: 'AI suggestions: review before accepting. They are not verified findings.', tokens: out.inputTokens + out.outputTokens };
    },
    async explain(userId, appId, runId, testId) {
        assertEnabled();
        const app = await authorize(userId, appId);
        const run = await prisma_1.prisma.testRun.findUnique({ where: { id: runId } });
        if (!run || run.testAppId !== appId)
            throw (0, http_error_1.NotFound)('Run not found');
        const result = (run.results || []).find((r) => r.id === testId);
        if (!result)
            throw (0, http_error_1.NotFound)('Test result not found');
        if (result.status === 'passed')
            throw (0, http_error_1.BadRequest)('This test passed; there is nothing to explain.');
        const out = await complete(app.workspaceId, (0, ai_1.explainPrompt)(result), 400);
        return { explanation: out.text.trim().slice(0, 1500), provenance: 'ai', note: 'AI explanation based only on the recorded evidence. Not verified.', tokens: out.inputTokens + out.outputTokens, sent: (0, ai_1.redact)({ name: result.name, error: result.error }) };
    },
};
