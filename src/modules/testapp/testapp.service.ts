import { TestApp, TestAppSession } from '@prisma/client';
import { json, prisma } from '../../core/database/prisma';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../core/errors/http-error';
import { diffContracts } from '../../shared/testapp/contract';
import { generateApp } from '../../shared/testapp/generate';
import { MockCtx, MockState, createInitialState, invoke } from '../../shared/testapp/mock';
import { runMockTests } from '../../shared/testapp/testing';
import { ActionDef, Bundle, Override } from '../../shared/testapp/types';
import { hashOf, isObj } from '../../shared/testapp/util';
import { assertCollectionAccess } from '../collections/collection.access';
import { collectionService } from '../collections/collection.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { InvokeInput } from './testapp.schema';

export const TESTAPP_LIMITS = { appsPerWorkspace: 20, versionsPerApp: 20, sessionsPerUserApp: 10, sessionTtlMs: 24 * 3600 * 1000, logEntries: 200, runsPerApp: 50 };

/** Any workspace member can read; `viewer`s cannot change anything. */
async function access(userId: string, id: string, write = false): Promise<TestApp> {
  const app = await prisma.testApp.findUnique({ where: { id } });
  if (!app) throw NotFound('Test app not found');
  const member = await assertWorkspaceMember(userId, app.workspaceId);
  if (write && member.role === 'viewer') throw Forbidden('Viewers cannot change test apps');
  return app;
}

async function writable(userId: string, collectionId: string) {
  const collection = await assertCollectionAccess(userId, collectionId);
  const member = await assertWorkspaceMember(userId, collection.workspaceId);
  if (member.role === 'viewer') throw Forbidden('Viewers cannot generate test apps');
  return collection;
}

const toOverrides = (rows: { target: string; decision: unknown }[]): Override[] => rows.map((r) => ({ target: r.target, decision: r.decision as Override['decision'] }));

async function version(appId: string, versionId: string | null | undefined) {
  const v = await prisma.testAppVersion.findFirst({ where: versionId ? { id: versionId, testAppId: appId } : { testAppId: appId }, orderBy: { version: 'desc' } });
  if (!v) throw NotFound('Version not found');
  return v;
}

const bundleOf = (v: { model: unknown; contract: unknown; graph: unknown; schema: unknown; stats: unknown }): Bundle => ({ model: v.model, contract: v.contract, graph: v.graph, schema: v.schema, stats: v.stats }) as Bundle;
const ctxOf = (v: Parameters<typeof bundleOf>[0], settings: unknown): MockCtx => ({ ...bundleOf(v), settings: isObj(settings) ? (settings as MockCtx['settings']) : undefined });

const summary = (b: Bundle) => ({ stats: b.stats, warnings: b.model.warnings, review: b.schema.review, conflicts: b.schema.conflicts, screens: b.schema.screens.map((s) => ({ id: s.id, title: s.title, kind: s.kind, sources: s.sources })) });

/** Builds a bundle from the live collection (source is only read, never written). */
async function buildFromCollection(collectionId: string, overrides: Override[], seed: number) {
  const collectionJson = await collectionService.toPostman(collectionId);
  return { bundle: generateApp(collectionJson, { overrides, seed, sourceHash: hashOf(collectionJson) }), sourceHash: hashOf(collectionJson) };
}

function orphanOverrides(bundle: Bundle, overrides: Override[]) {
  const known = new Set([...bundle.model.endpoints.map((e) => e.key), ...bundle.schema.screens.map((s) => s.id)]);
  return overrides.filter((o) => !known.has(o.target)).map((o) => o.target);
}

const castInput = (kind: string, v: unknown) => {
  if (v === '' || v === undefined || v === null) return undefined;
  if (kind === 'number') return Number.isNaN(Number(v)) ? v : Number(v);
  if (kind === 'checkbox') return v === true || v === 'true';
  if (kind === 'textarea' && typeof v === 'string') {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
};

function requestFromAction(action: ActionDef, values: Record<string, unknown>) {
  const pathParams: Record<string, string> = {};
  const query: Record<string, string> = {};
  const body: Record<string, unknown> = {};
  for (const f of action.inputs) {
    const raw = values[f.name];
    const v = castInput(f.input, raw);
    if (v === undefined) continue;
    if (f.in === 'path') pathParams[f.name] = String(v);
    else if (f.in === 'query') query[f.name] = String(v);
    else if (f.in === 'body' || f.in === 'form') body[f.name] = v;
  }
  return { pathParams, query, body };
}

export const testAppService = {
  async analyze(userId: string, collectionId: string) {
    await assertCollectionAccess(userId, collectionId);
    const { bundle } = await buildFromCollection(collectionId, [], 1);
    return summary(bundle);
  },

  async list(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    const apps = await prisma.testApp.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, stats: true, createdAt: true, sourceHash: true } } } });
    return apps.map(({ versions, ...a }) => ({ ...a, latest: versions[0] || null }));
  },

  async create(userId: string, input: { collectionId: string; name?: string; seed: number }) {
    const collection = await writable(userId, input.collectionId);
    const count = await prisma.testApp.count({ where: { workspaceId: collection.workspaceId } });
    if (count >= TESTAPP_LIMITS.appsPerWorkspace) throw Forbidden(`A workspace can have up to ${TESTAPP_LIMITS.appsPerWorkspace} test apps.`);
    const { bundle, sourceHash } = await buildFromCollection(collection.id, [], input.seed);
    const app = await prisma.testApp.create({ data: { workspaceId: collection.workspaceId, collectionId: collection.id, name: input.name || `${collection.name} — Test App`, createdById: userId, settings: {} } });
    const v = await testAppService.saveVersion(app.id, 1, bundle, sourceHash, input.seed, userId);
    await prisma.testApp.update({ where: { id: app.id }, data: { currentVersionId: v.id } });
    return { app: { ...app, currentVersionId: v.id }, version: { id: v.id, version: 1 }, ...summary(bundle) };
  },

  saveVersion(testAppId: string, n: number, bundle: Bundle, sourceHash: string, seed: number, userId: string) {
    return prisma.testAppVersion.create({
      data: {
        testAppId, version: n, sourceHash, seed, createdById: userId,
        contractVersion: bundle.contract.version, ruleSetVersion: bundle.schema.app.ruleSetVersion,
        model: json(bundle.model), contract: json(bundle.contract), graph: json(bundle.graph), schema: json(bundle.schema), stats: json(bundle.stats),
      },
    });
  },

  async get(userId: string, id: string) {
    const app = await access(userId, id);
    const v = await version(id, app.currentVersionId);
    const overrides = await prisma.testAppOverride.findMany({ where: { testAppId: id } });
    const collection = await prisma.collection.findUnique({ where: { id: app.collectionId }, select: { id: true, name: true, deletedAt: true } });
    return { app, version: { id: v.id, version: v.version, sourceHash: v.sourceHash, contractVersion: v.contractVersion, ruleSetVersion: v.ruleSetVersion, seed: v.seed, createdAt: v.createdAt, stats: v.stats }, schema: v.schema, warnings: (v.model as any).warnings, overrides, collection };
  },

  async versionPart(userId: string, id: string, n: number, part: string) {
    await access(userId, id);
    const v = await prisma.testAppVersion.findUnique({ where: { testAppId_version: { testAppId: id, version: n } } });
    if (!v) throw NotFound('Version not found');
    if (!['schema', 'contract', 'graph', 'model', 'stats'].includes(part)) throw BadRequest('Unknown part');
    return (v as any)[part];
  },

  async versions(userId: string, id: string) {
    await access(userId, id);
    return prisma.testAppVersion.findMany({ where: { testAppId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, sourceHash: true, contractVersion: true, ruleSetVersion: true, stats: true, createdAt: true } });
  },

  async update(userId: string, id: string, input: { name?: string; settings?: Record<string, unknown> }) {
    const app = await access(userId, id, true);
    return prisma.testApp.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(input.settings ? { settings: json({ ...(isObj(app.settings) ? app.settings : {}), ...input.settings }) } : {}) } });
  },

  async remove(userId: string, id: string) {
    await access(userId, id, true);
    await prisma.testApp.delete({ where: { id } });
  },

  async setOverride(userId: string, id: string, target: string, decision: Override['decision']) {
    await access(userId, id, true);
    return prisma.testAppOverride.upsert({ where: { testAppId_target: { testAppId: id, target } }, create: { testAppId: id, target, decision: json(decision), createdById: userId }, update: { decision: json(decision) } });
  },

  async removeOverride(userId: string, id: string, target: string) {
    await access(userId, id, true);
    await prisma.testAppOverride.deleteMany({ where: { testAppId: id, target } });
  },

  /** Impact report (preview) or a new immutable version. Approved overrides are re-applied, never dropped silently. */
  async regenerate(userId: string, id: string, opts: { preview: boolean; seed?: number }) {
    const app = await access(userId, id, true);
    const current = await version(id, app.currentVersionId);
    const overrides = toOverrides(await prisma.testAppOverride.findMany({ where: { testAppId: id } }));
    const seed = opts.seed ?? current.seed;
    const { bundle, sourceHash } = await buildFromCollection(app.collectionId, overrides, seed);
    const before = bundleOf(current);
    const beforeScreens = new Set(before.schema.screens.map((s) => s.id));
    const afterScreens = new Set(bundle.schema.screens.map((s) => s.id));
    const impact = {
      sourceChanged: sourceHash !== current.sourceHash,
      contractChanges: diffContracts(before.contract, bundle.contract),
      screensAdded: [...afterScreens].filter((s) => !beforeScreens.has(s)),
      screensRemoved: [...beforeScreens].filter((s) => !afterScreens.has(s)),
      orphanOverrides: orphanOverrides(bundle, overrides),
      appliedOverrides: overrides.length,
    };
    if (opts.preview) return { impact, ...summary(bundle) };
    const created = await testAppService.saveVersion(id, current.version + 1, bundle, sourceHash, seed, userId);
    await prisma.testApp.update({ where: { id }, data: { currentVersionId: created.id } });
    const old = await prisma.testAppVersion.findMany({ where: { testAppId: id }, orderBy: { version: 'desc' }, skip: TESTAPP_LIMITS.versionsPerApp, select: { id: true } });
    if (old.length) await prisma.testAppVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return { impact, version: { id: created.id, version: created.version }, ...summary(bundle) };
  },

  /* ----------------------------- sessions ----------------------------- */

  async createSession(userId: string, id: string, input: { versionId?: string; seed?: number }) {
    const app = await access(userId, id);
    const v = await version(id, input.versionId || app.currentVersionId);
    const seed = input.seed ?? v.seed;
    const state = createInitialState(ctxOf(v, app.settings), seed);
    const mine = await prisma.testAppSession.findMany({ where: { testAppId: id, ownerId: userId }, orderBy: { createdAt: 'desc' }, skip: TESTAPP_LIMITS.sessionsPerUserApp - 1, select: { id: true } });
    if (mine.length) await prisma.testAppSession.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
    const s = await prisma.testAppSession.create({ data: { testAppId: id, versionId: v.id, ownerId: userId, seed, state: json(state), logs: [], expiresAt: new Date(Date.now() + TESTAPP_LIMITS.sessionTtlMs) } });
    return { id: s.id, versionId: v.id, seed, expiresAt: s.expiresAt };
  },

  /** Session for a public share visitor (no user). */
  async createAnonymousSession(testAppId: string, versionId: string, ownerId: string, shareId: string, seed: number | undefined, ttlMs: number) {
    const app = await prisma.testApp.findUniqueOrThrow({ where: { id: testAppId } });
    const v = await prisma.testAppVersion.findUniqueOrThrow({ where: { id: versionId } });
    const useSeed = seed ?? v.seed;
    const state = createInitialState(ctxOf(v, app.settings), useSeed);
    const s = await prisma.testAppSession.create({ data: { testAppId, versionId, ownerId, shareId, seed: useSeed, state: json(state), logs: [], expiresAt: new Date(Date.now() + ttlMs) } });
    return { id: s.id, seed: useSeed, expiresAt: s.expiresAt };
  },

  async session(userId: string, id: string, sessionId: string) {
    const app = await access(userId, id);
    const s = await prisma.testAppSession.findUnique({ where: { id: sessionId } });
    if (!s || s.testAppId !== id || s.ownerId !== userId) throw NotFound('Session not found');
    if (s.expiresAt < new Date()) throw NotFound('Session expired');
    return { app, s };
  },

  async invoke(userId: string, id: string, sessionId: string, input: InvokeInput) {
    const { app, s } = await testAppService.session(userId, id, sessionId);
    return testAppService.invokeOnSession(app, s, input);
  },

  /** Runs one mock call on a loaded session (owner checks are the caller's job). */
  async invokeOnSession(app: TestApp, s: TestAppSession, input: InvokeInput) {
    const v = await prisma.testAppVersion.findUniqueOrThrow({ where: { id: s.versionId } });
    const schema = v.schema as unknown as Bundle['schema'];
    const action = input.actionId ? schema.actions[input.actionId] : undefined;
    if (input.actionId && !action) throw NotFound('Action not found in this version');
    const endpoint = action?.endpoint || input.endpoint;
    const fromValues = action ? requestFromAction(action, input.values) : { pathParams: {}, query: {}, body: {} };
    const hasValuesBody = Object.keys(fromValues.body).length > 0;
    const req = {
      endpoint,
      pathParams: { ...fromValues.pathParams, ...(input.pathParams || {}) },
      query: { ...fromValues.query, ...(input.query || {}) },
      body: input.body !== undefined ? input.body : hasValuesBody ? fromValues.body : undefined,
      scenario: input.scenario,
    };
    const started = Date.now();
    const out = invoke(ctxOf(v, app.settings), s.state as unknown as MockState, req);
    const log = { ts: new Date().toISOString(), actionId: input.actionId, endpoint: out.result.endpoint || endpoint, role: out.result.role, request: req, status: out.result.status, scenario: input.scenario || 'success', provenance: out.result.provenance, trace: out.result.trace, durationMs: Date.now() - started };
    const logs = [...(Array.isArray(s.logs) ? (s.logs as unknown[]) : []), log].slice(-TESTAPP_LIMITS.logEntries);
    const saved = await prisma.testAppSession.updateMany({ where: { id: s.id, rev: s.rev }, data: { state: json(out.state), logs: json(logs), rev: { increment: 1 }, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + TESTAPP_LIMITS.sessionTtlMs) } });
    if (!saved.count) throw Conflict('The session changed in another tab; retry the request.');
    return { request: req, response: { status: out.result.status, headers: out.result.headers, body: out.result.body }, trace: out.result.trace, provenance: out.result.provenance, role: out.result.role, endpoint: out.result.endpoint, actionId: input.actionId, durationMs: log.durationMs, loggedIn: !!(out.state as MockState).current };
  },

  async reset(userId: string, id: string, sessionId: string, seed?: number) {
    const { app, s } = await testAppService.session(userId, id, sessionId);
    return testAppService.resetSession(app, s, seed);
  },

  async resetSession(app: TestApp, s: TestAppSession, seed?: number) {
    const v = await prisma.testAppVersion.findUniqueOrThrow({ where: { id: s.versionId } });
    const nextSeed = seed ?? s.seed;
    await prisma.testAppSession.update({ where: { id: s.id }, data: { state: json(createInitialState(ctxOf(v, app.settings), nextSeed)), seed: nextSeed, logs: [], rev: { increment: 1 } } });
    return { ok: true, seed: nextSeed };
  },

  async logs(userId: string, id: string, sessionId: string) {
    const { s } = await testAppService.session(userId, id, sessionId);
    return s.logs || [];
  },

  async stateSummary(userId: string, id: string, sessionId: string) {
    const { s } = await testAppService.session(userId, id, sessionId);
    const st = s.state as unknown as MockState;
    return { rev: st.rev, seed: st.seed, loggedIn: !!st.current, tables: Object.fromEntries(Object.entries(st.tables).map(([k, v]) => [k, v.length])) };
  },

  /* ----------------------------- test runs ----------------------------- */

  async run(userId: string, id: string) {
    const app = await access(userId, id, true);
    const v = await version(id, app.currentVersionId);
    const out = runMockTests(bundleOf(v), { seed: v.seed });
    const row = await prisma.testRun.create({ data: { testAppId: id, versionId: v.id, mode: 'mock', stats: json(out.stats), results: json(out.results), coverage: json(out.coverage), startedById: userId } });
    const old = await prisma.testRun.findMany({ where: { testAppId: id }, orderBy: { createdAt: 'desc' }, skip: TESTAPP_LIMITS.runsPerApp, select: { id: true } });
    if (old.length) await prisma.testRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return { id: row.id, createdAt: row.createdAt, version: v.version, ...out };
  },

  async runs(userId: string, id: string) {
    await access(userId, id);
    return prisma.testRun.findMany({ where: { testAppId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, mode: true, stats: true, versionId: true, createdAt: true } });
  },

  async getRun(userId: string, id: string, runId: string) {
    await access(userId, id);
    const r = await prisma.testRun.findUnique({ where: { id: runId } });
    if (!r || r.testAppId !== id) throw NotFound('Run not found');
    const v = await prisma.testAppVersion.findUnique({ where: { id: r.versionId }, select: { version: true, sourceHash: true, contractVersion: true, ruleSetVersion: true, seed: true } });
    return { ...r, versionInfo: v };
  },

  async reportMarkdown(userId: string, id: string, runId: string) {
    const r = await testAppService.getRun(userId, id, runId);
    const app = await prisma.testApp.findUniqueOrThrow({ where: { id } });
    const stats = (r.stats || {}) as Record<string, number>;
    const results = (r.results || []) as any[];
    const esc = (s: unknown) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    return [
      `# Test report — ${app.name}`,
      '',
      `- Run: ${r.id} (${r.mode}) at ${r.createdAt.toISOString()}`,
      `- Version: v${r.versionInfo?.version} · collection hash \`${r.versionInfo?.sourceHash?.slice(0, 12)}\` · contract \`${r.versionInfo?.contractVersion}\` · rules \`${r.versionInfo?.ruleSetVersion}\` · seed ${r.versionInfo?.seed}`,
      `- Result: ${stats.passed} passed, ${stats.failed} failed, ${stats.warnings} warnings, ${stats.skipped} skipped`,
      '',
      '> Mock-mode results verify the generated contract and mapping. Findings marked "inferred" come from example-derived schemas, not from a verified backend.',
      '',
      '| ID | Status | Type | Name | Endpoint | Expected | Actual | Certainty | Notes |',
      '|---|---|---|---|---|---|---|---|---|',
      ...results.map((t) => `| ${t.id} | ${t.status} | ${t.type} | ${esc(t.name)} | ${esc(t.endpoint || t.screen || '')} | ${esc(t.expected)} | ${esc(t.actual)} | ${t.certainty} | ${esc(t.error)} |`),
    ].join('\n');
  },

  async coverage(userId: string, id: string) {
    const app = await access(userId, id);
    const v = await version(id, app.currentVersionId);
    const out = runMockTests(bundleOf(v), { seed: v.seed });
    return out.coverage;
  },
};

export async function pruneTestAppSessions() {
  await prisma.testAppSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
