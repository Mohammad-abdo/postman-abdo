import { TestApp, TestAppSession } from '@prisma/client';
import { json, prisma } from '../../core/database/prisma';
import { BadRequest, Conflict, Forbidden, NotFound } from '../../core/errors/http-error';
import { diffContracts } from '../../shared/testapp/contract';
import { generateApp } from '../../shared/testapp/generate';
import { MockCtx, MockState, createInitialState, invoke } from '../../shared/testapp/mock';
import { CustomTest, TestResult, compareRuns, coverageOf, createMockProbe, runMockTests } from '../../shared/testapp/testing';
import { validateRule } from '../../shared/testapp/custom-rules';
import { BUILTIN_RULES } from '../../shared/testapp/rules';
import { compareResponses, isSafeMethod } from '../../shared/testapp/real';
import { validateAgainst } from '../../shared/testapp/contract';
import { ActionDef, Bundle, Override } from '../../shared/testapp/types';
import { REAL_LIMITS, assertRealEnabled, executeReal, loadRealContext, realSettingsOf } from './real.service';
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
async function buildFromCollection(collectionId: string, overrides: Override[], seed: number, settings?: unknown) {
  const collectionJson = await collectionService.toPostman(collectionId);
  const s = (isObj(settings) ? settings : {}) as { customRules?: unknown[]; disabledRules?: string[] };
  return { bundle: generateApp(collectionJson, { overrides, seed, sourceHash: hashOf(collectionJson), customRules: s.customRules, disabledRules: s.disabledRules }), sourceHash: hashOf(collectionJson) };
}

const settingsOf = (app: TestApp) => (isObj(app.settings) ? app.settings : {}) as { customRules?: any[]; disabledRules?: string[]; customTests?: CustomTest[]; validation?: 'lenient' | 'strict'; rows?: number };

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
    // Pointing the app at a real backend is a workspace-admin decision.
    if (input.settings && 'real' in input.settings) {
      const member = await assertWorkspaceMember(userId, app.workspaceId);
      if (member.role !== 'admin') throw Forbidden('Only workspace admins can configure Real API mode');
    }
    return prisma.testApp.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(input.settings ? { settings: json({ ...(isObj(app.settings) ? app.settings : {}), ...input.settings }) } : {}) } });
  },

  /* ----------------------------- rules ----------------------------- */

  async rules(userId: string, id: string) {
    const app = await access(userId, id);
    const s = settingsOf(app);
    return {
      custom: s.customRules || [],
      disabled: s.disabledRules || [],
      builtin: BUILTIN_RULES.map((r) => ({ id: r.id, name: r.name, description: r.description, priority: r.priority, enabled: !(s.disabledRules || []).includes(r.id), version: r.version })),
    };
  },

  async saveRules(userId: string, id: string, input: { custom: unknown[]; disabled: string[] }) {
    const app = await access(userId, id, true);
    const known = new Set(BUILTIN_RULES.map((r) => r.id));
    const unknown = input.disabled.filter((d) => !known.has(d));
    if (unknown.length) throw BadRequest(`Unknown built-in rule(s): ${unknown.join(', ')}`);
    const problems: { ruleId: string; errors: string[] }[] = [];
    const ids = new Set<string>();
    input.custom.forEach((r) => {
      const errors = validateRule(r);
      const rid = String((r as { id?: unknown })?.id);
      if (ids.has(rid)) errors.push('duplicate rule id');
      ids.add(rid);
      if (errors.length) problems.push({ ruleId: rid, errors });
    });
    if (problems.length) throw BadRequest(`Invalid rule(s): ${problems.map((p) => `${p.ruleId}: ${p.errors.join('; ')}`).join(' | ')}`);
    await prisma.testApp.update({ where: { id }, data: { settings: json({ ...settingsOf(app), customRules: input.custom, disabledRules: input.disabled }) } });
    return { ok: true, note: 'Rules apply the next time you regenerate.' };
  },

  /** Dry run: what would these rules do to the current collection? Nothing is saved. */
  async previewRules(userId: string, id: string, input: { custom: unknown[]; disabled: string[] }) {
    const app = await access(userId, id);
    const overrides = toOverrides(await prisma.testAppOverride.findMany({ where: { testAppId: id } }));
    const current = await version(id, app.currentVersionId);
    const { bundle } = await buildFromCollection(app.collectionId, overrides, current.seed, { ...settingsOf(app), customRules: input.custom, disabledRules: input.disabled });
    const before = bundleOf(current);
    const changed = Object.keys(bundle.schema.dispositions).filter((k) => before.schema.dispositions[k]?.state !== bundle.schema.dispositions[k].state || before.schema.dispositions[k]?.ruleId !== bundle.schema.dispositions[k].ruleId);
    return {
      matches: bundle.customRules.matches,
      invalid: bundle.customRules.invalid,
      changedEndpoints: changed.map((k) => ({ endpoint: k, from: before.schema.dispositions[k]?.state, to: bundle.schema.dispositions[k].state, rule: bundle.schema.dispositions[k].ruleId })),
      stats: bundle.stats,
    };
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
    const { bundle, sourceHash } = await buildFromCollection(app.collectionId, overrides, seed, app.settings);
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

  async run(userId: string, id: string, opts: { mode?: 'mock' | 'real' | 'compare'; confirmUnsafe?: boolean; confirmProduction?: boolean } = {}) {
    const app = await access(userId, id, true);
    const v = await version(id, app.currentVersionId);
    const mode = opts.mode || 'mock';
    const bundle = bundleOf(v);
    let results: TestResult[];
    let extra: { hosts?: string[]; calls?: number } = {};
    if (mode === 'mock') {
      results = runMockTests(bundle, { seed: v.seed, customTests: settingsOf(app).customTests }).results;
    } else {
      assertRealEnabled(app);
      const real = await testAppService.runAgainstReal(userId, app, bundle, v.seed, mode, opts);
      results = real.results;
      extra = { hosts: real.hosts, calls: real.calls };
    }
    const count = (s: string) => results.filter((r) => r.status === s).length;
    const stats = { total: results.length, passed: count('passed'), failed: count('failed'), warnings: count('warning'), skipped: count('skipped') };
    const coverage = coverageOf(bundle, results);
    // regression: compare with the previous run of the same mode
    const prev = await prisma.testRun.findFirst({ where: { testAppId: id, mode }, orderBy: { createdAt: 'desc' } });
    const regression = prev ? compareRuns((prev.results || []) as unknown as TestResult[], results) : null;
    const row = await prisma.testRun.create({ data: { testAppId: id, versionId: v.id, mode, stats: json({ ...stats, regression: regression && { newFailures: regression.newFailures.length, fixed: regression.fixed.length } }), results: json(results), coverage: json({ ...coverage, regression, ...extra }), startedById: userId } });
    const old = await prisma.testRun.findMany({ where: { testAppId: id }, orderBy: { createdAt: 'desc' }, skip: TESTAPP_LIMITS.runsPerApp, select: { id: true } });
    if (old.length) await prisma.testRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return { id: row.id, createdAt: row.createdAt, version: v.version, mode, results, stats, coverage: { ...coverage, regression }, regression, ...extra };
  },

  /** Real / comparison runs: only documented-safe calls by default, bounded in count and time. */
  async runAgainstReal(userId: string, app: TestApp, bundle: Bundle, seed: number, mode: 'real' | 'compare', opts: { confirmUnsafe?: boolean; confirmProduction?: boolean }) {
    const context = await loadRealContext(userId, app);
    const probe = mode === 'compare' ? createMockProbe(bundle, seed) : null;
    const results: TestResult[] = [];
    const hosts = new Set<string>();
    const started = Date.now();
    let calls = 0;
    const add = (r: Omit<TestResult, 'id' | 'mode'>) => results.push({ id: `T${String(results.length + 1).padStart(3, '0')}`, mode, ...r });
    const candidates = bundle.model.endpoints.filter((e) => !['excluded', 'background'].includes(bundle.schema.dispositions[e.key]?.state) && !['auth.login', 'auth.logout', 'auth.refresh'].includes(bundle.graph.roles[e.key]?.role));
    for (const e of candidates) {
      const documented = [...new Set(e.examples.map((x) => x.code))];
      const actionId = Object.values(bundle.schema.actions).find((a) => a.endpoint === e.key)?.id;
      const base = { endpoint: e.key, action: actionId };
      if (!e.examples.some((x) => x.code >= 200 && x.code < 300)) continue; // nothing documented to verify
      if (calls >= REAL_LIMITS.maxEndpointsPerRun || Date.now() - started > REAL_LIMITS.runBudgetMs) {
        add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: 'skipped', expected: 'a real call', actual: 'not run', certainty: 'inferred', error: 'Run limit reached (40 endpoints or 2 minutes per run). Run again for the rest.' });
        continue;
      }
      if (!isSafeMethod(e.method) && !opts.confirmUnsafe) {
        add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: 'skipped', expected: 'a real call', actual: 'not run', certainty: 'inferred', error: `${e.method} changes data and was not confirmed for this run.` });
        continue;
      }
      calls++;
      const out = await executeReal({ userId, app, endpoint: e, confirmUnsafe: opts.confirmUnsafe, confirmProduction: opts.confirmProduction, context });
      if (out.kind !== 'ok') {
        add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: out.kind === 'error' ? 'failed' : 'skipped', expected: 'a real response', actual: out.kind, certainty: 'verified', error: out.reason });
        continue;
      }
      try {
        hosts.add(new URL(out.url).host);
      } catch {
        /* ignore */
      }
      const contract = bundle.contract.endpoints[e.key];
      if (probe) {
        const mock = probe(e.key);
        const cmp = compareResponses({ mock: { status: mock.status, body: mock.body }, real: { status: out.status, body: out.body }, documentedCodes: documented, contract });
        add({ ...base, name: `${e.key}: mock vs real`, type: 'contract', status: cmp.status, expected: cmp.expected, actual: cmp.actual, certainty: cmp.certainty, error: cmp.error, evidence: { request: { url: out.url }, response: { mockStatus: mock.status, realStatus: out.status, differences: cmp.diffs.slice(0, 30) } } });
      } else {
        const schema = contract?.responses[String(out.status)]?.schema;
        const issues = schema ? validateAgainst(schema, out.body) : [];
        const statusOk = documented.includes(out.status);
        add({
          ...base,
          name: `${e.key} matches the contract (real)`,
          type: 'contract',
          status: !statusOk ? 'failed' : issues.length ? 'warning' : 'passed',
          expected: `status in [${documented.join(', ')}] and the example structure`,
          actual: `status ${out.status}${issues.length ? `; ${issues.length} schema note(s)` : ''} in ${out.ms} ms`,
          certainty: !statusOk ? 'verified' : issues.length ? 'inferred' : 'verified',
          error: [...(statusOk ? [] : [`Real status ${out.status} is not among the documented statuses`]), ...issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`)].join('; ') || undefined,
          evidence: { request: { url: out.url }, response: { status: out.status, headers: out.headers, body: out.body } },
        });
      }
    }
    return { results, hosts: [...hosts], calls };
  },

  /** One action against the real backend from the Preview (same guards as test runs). */
  async realInvoke(userId: string, id: string, input: { actionId: string; values: Record<string, unknown>; confirmUnsafe?: boolean; confirmProduction?: boolean }) {
    const app = await access(userId, id, true);
    assertRealEnabled(app);
    const v = await version(id, app.currentVersionId);
    const schema = v.schema as unknown as Bundle['schema'];
    const action = schema.actions[input.actionId];
    if (!action) throw NotFound('Action not found in this version');
    const endpoint = (v.model as unknown as Bundle['model']).endpoints.find((e) => e.key === action.endpoint);
    if (!endpoint) throw NotFound('Endpoint not found');
    const req = requestFromAction(action, input.values);
    const started = Date.now();
    const out = await executeReal({ userId, app, endpoint, values: { pathParams: req.pathParams, query: req.query, body: Object.keys(req.body).length ? req.body : undefined }, confirmUnsafe: input.confirmUnsafe, confirmProduction: input.confirmProduction });
    if (out.kind !== 'ok') {
      if (out.kind === 'blocked') throw Forbidden(out.reason);
      throw BadRequest(out.reason);
    }
    return { request: { endpoint: endpoint.key, url: out.url, ...req }, response: { status: out.status, headers: out.headers, body: out.body }, trace: ['sent to the REAL backend (allowlisted host)'], provenance: 'real', role: undefined, endpoint: endpoint.key, actionId: input.actionId, durationMs: Date.now() - started, loggedIn: false };
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
