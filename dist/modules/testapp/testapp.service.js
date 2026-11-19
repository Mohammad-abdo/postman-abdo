"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.testAppService = exports.TESTAPP_LIMITS = void 0;
exports.pruneTestAppSessions = pruneTestAppSessions;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const contract_1 = require("../../shared/testapp/contract");
const ai_1 = require("../../shared/testapp/ai");
const generate_1 = require("../../shared/testapp/generate");
const mock_1 = require("../../shared/testapp/mock");
const testing_1 = require("../../shared/testapp/testing");
const custom_rules_1 = require("../../shared/testapp/custom-rules");
const rules_1 = require("../../shared/testapp/rules");
const real_1 = require("../../shared/testapp/real");
const contract_2 = require("../../shared/testapp/contract");
const real_service_1 = require("./real.service");
const util_1 = require("../../shared/testapp/util");
const collection_access_1 = require("../collections/collection.access");
const collection_service_1 = require("../collections/collection.service");
const workspace_access_1 = require("../workspaces/workspace.access");
exports.TESTAPP_LIMITS = { appsPerWorkspace: 20, versionsPerApp: 20, sessionsPerUserApp: 10, sessionTtlMs: 24 * 3600 * 1000, logEntries: 200, runsPerApp: 50 };
/** Any workspace member can read; `viewer`s cannot change anything. */
async function access(userId, id, write = false) {
    const app = await prisma_1.prisma.testApp.findUnique({ where: { id } });
    if (!app)
        throw (0, http_error_1.NotFound)('Test app not found');
    const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, app.workspaceId);
    if (write && member.role === 'viewer')
        throw (0, http_error_1.Forbidden)('Viewers cannot change test apps');
    return app;
}
async function writable(userId, collectionId) {
    const collection = await (0, collection_access_1.assertCollectionAccess)(userId, collectionId);
    const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, collection.workspaceId);
    if (member.role === 'viewer')
        throw (0, http_error_1.Forbidden)('Viewers cannot generate test apps');
    return collection;
}
const toOverrides = (rows) => rows.map((r) => ({ target: r.target, decision: r.decision }));
async function version(appId, versionId) {
    const v = await prisma_1.prisma.testAppVersion.findFirst({ where: versionId ? { id: versionId, testAppId: appId } : { testAppId: appId }, orderBy: { version: 'desc' } });
    if (!v)
        throw (0, http_error_1.NotFound)('Version not found');
    return v;
}
const bundleOf = (v) => ({ model: v.model, contract: v.contract, graph: v.graph, schema: v.schema, stats: v.stats });
const ctxOf = (v, settings) => ({ ...bundleOf(v), settings: (0, util_1.isObj)(settings) ? settings : undefined });
const summary = (b) => ({ stats: b.stats, warnings: b.model.warnings, review: b.schema.review, conflicts: b.schema.conflicts, screens: b.schema.screens.map((s) => ({ id: s.id, title: s.title, kind: s.kind, sources: s.sources })) });
/** Builds a bundle from the live collection (source is only read, never written). */
async function buildFromCollection(collectionId, overrides, seed, settings) {
    const collectionJson = await collection_service_1.collectionService.toPostman(collectionId);
    const s = ((0, util_1.isObj)(settings) ? settings : {});
    return { bundle: (0, generate_1.generateApp)(collectionJson, { perRequest: true, overrides, seed, sourceHash: (0, util_1.hashOf)(collectionJson), customRules: s.customRules, disabledRules: s.disabledRules }), sourceHash: (0, util_1.hashOf)(collectionJson) };
}
const settingsOf = (app) => ((0, util_1.isObj)(app.settings) ? app.settings : {});
function orphanOverrides(bundle, overrides) {
    const known = new Set([...bundle.model.endpoints.map((e) => e.key), ...bundle.schema.screens.map((s) => s.id)]);
    return overrides.filter((o) => !known.has(o.target)).map((o) => o.target);
}
const castInput = (kind, v) => {
    if (v === '' || v === undefined || v === null)
        return undefined;
    if (kind === 'number')
        return Number.isNaN(Number(v)) ? v : Number(v);
    if (kind === 'checkbox')
        return v === true || v === 'true';
    if (kind === 'textarea' && typeof v === 'string') {
        try {
            return JSON.parse(v);
        }
        catch {
            return v;
        }
    }
    return v;
};
function requestFromAction(action, values) {
    const pathParams = Object.create(null);
    const query = Object.create(null);
    const queryEntries = [];
    const body = Object.create(null);
    const headers = Object.create(null);
    let rawBody;
    for (const f of action.inputs) {
        const raw = values[f.key ?? f.name];
        if (f.rawBody) {
            rawBody = raw;
            continue;
        }
        const v = action.kind === 'request' && typeof raw === 'string' && ['header', 'query', 'form'].includes(f.in) ? raw : castInput(f.input, raw);
        if (v === undefined)
            continue;
        if (f.in === 'path')
            pathParams[f.name] = String(v);
        else if (f.in === 'query') {
            query[f.name] = String(v);
            queryEntries.push([f.name, String(v)]);
        }
        else if (f.in === 'header')
            headers[f.name] = String(v);
        else if (f.in === 'body' || f.in === 'form')
            body[f.name] = v;
    }
    return { pathParams, query, queryEntries, body, headers, rawBody };
}
exports.testAppService = {
    async analyze(userId, collectionId) {
        await (0, collection_access_1.assertCollectionAccess)(userId, collectionId);
        const { bundle } = await buildFromCollection(collectionId, [], 1);
        return summary(bundle);
    },
    async list(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        const apps = await prisma_1.prisma.testApp.findMany({ where: { workspaceId }, orderBy: { updatedAt: 'desc' }, include: { versions: { orderBy: { version: 'desc' }, take: 1, select: { id: true, version: true, stats: true, createdAt: true, sourceHash: true } } } });
        return apps.map(({ versions, ...a }) => ({ ...a, latest: versions[0] || null }));
    },
    async create(userId, input) {
        const collection = await writable(userId, input.collectionId);
        const count = await prisma_1.prisma.testApp.count({ where: { workspaceId: collection.workspaceId } });
        if (count >= exports.TESTAPP_LIMITS.appsPerWorkspace)
            throw (0, http_error_1.Forbidden)(`A workspace can have up to ${exports.TESTAPP_LIMITS.appsPerWorkspace} test apps.`);
        const { bundle, sourceHash } = await buildFromCollection(collection.id, [], input.seed);
        const app = await prisma_1.prisma.testApp.create({ data: { workspaceId: collection.workspaceId, collectionId: collection.id, name: input.name || `${collection.name} — Test App`, createdById: userId, settings: {} } });
        const v = await exports.testAppService.saveVersion(app.id, 1, bundle, sourceHash, input.seed, userId);
        await prisma_1.prisma.testApp.update({ where: { id: app.id }, data: { currentVersionId: v.id } });
        return { app: { ...app, currentVersionId: v.id }, version: { id: v.id, version: 1 }, ...summary(bundle) };
    },
    saveVersion(testAppId, n, bundle, sourceHash, seed, userId) {
        return prisma_1.prisma.testAppVersion.create({
            data: {
                testAppId, version: n, sourceHash, seed, createdById: userId,
                contractVersion: bundle.contract.version, ruleSetVersion: bundle.schema.app.ruleSetVersion,
                model: (0, prisma_1.json)(bundle.model), contract: (0, prisma_1.json)(bundle.contract), graph: (0, prisma_1.json)(bundle.graph), schema: (0, prisma_1.json)(bundle.schema), stats: (0, prisma_1.json)(bundle.stats),
            },
        });
    },
    async get(userId, id) {
        const app = await access(userId, id);
        const v = await version(id, app.currentVersionId);
        const overrides = await prisma_1.prisma.testAppOverride.findMany({ where: { testAppId: id } });
        const collection = await prisma_1.prisma.collection.findUnique({ where: { id: app.collectionId }, select: { id: true, name: true, deletedAt: true } });
        return { app, version: { id: v.id, version: v.version, sourceHash: v.sourceHash, contractVersion: v.contractVersion, ruleSetVersion: v.ruleSetVersion, seed: v.seed, createdAt: v.createdAt, stats: v.stats }, schema: v.schema, warnings: v.model.warnings, overrides, collection };
    },
    async versionPart(userId, id, n, part) {
        await access(userId, id);
        const v = await prisma_1.prisma.testAppVersion.findUnique({ where: { testAppId_version: { testAppId: id, version: n } } });
        if (!v)
            throw (0, http_error_1.NotFound)('Version not found');
        if (!['schema', 'contract', 'graph', 'model', 'stats'].includes(part))
            throw (0, http_error_1.BadRequest)('Unknown part');
        return v[part];
    },
    async versions(userId, id) {
        await access(userId, id);
        return prisma_1.prisma.testAppVersion.findMany({ where: { testAppId: id }, orderBy: { version: 'desc' }, select: { id: true, version: true, sourceHash: true, contractVersion: true, ruleSetVersion: true, stats: true, createdAt: true } });
    },
    async update(userId, id, input) {
        const app = await access(userId, id, true);
        // Pointing the app at a real backend is a workspace-admin decision.
        if (input.settings && 'real' in input.settings) {
            const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, app.workspaceId);
            if (member.role !== 'admin')
                throw (0, http_error_1.Forbidden)('Only workspace admins can configure Real API mode');
        }
        return prisma_1.prisma.testApp.update({ where: { id }, data: { ...(input.name ? { name: input.name } : {}), ...(input.settings ? { settings: (0, prisma_1.json)({ ...((0, util_1.isObj)(app.settings) ? app.settings : {}), ...input.settings }) } : {}) } });
    },
    /* ----------------------------- rules ----------------------------- */
    async rules(userId, id) {
        const app = await access(userId, id);
        const s = settingsOf(app);
        return {
            custom: s.customRules || [],
            disabled: s.disabledRules || [],
            builtin: rules_1.BUILTIN_RULES.map((r) => ({ id: r.id, name: r.name, description: r.description, priority: r.priority, enabled: !(s.disabledRules || []).includes(r.id), version: r.version })),
        };
    },
    async saveRules(userId, id, input) {
        const app = await access(userId, id, true);
        const known = new Set(rules_1.BUILTIN_RULES.map((r) => r.id));
        const unknown = input.disabled.filter((d) => !known.has(d));
        if (unknown.length)
            throw (0, http_error_1.BadRequest)(`Unknown built-in rule(s): ${unknown.join(', ')}`);
        const problems = [];
        const ids = new Set();
        input.custom.forEach((r) => {
            const errors = (0, custom_rules_1.validateRule)(r);
            const rid = String(r?.id);
            if (ids.has(rid))
                errors.push('duplicate rule id');
            ids.add(rid);
            if (errors.length)
                problems.push({ ruleId: rid, errors });
        });
        if (problems.length)
            throw (0, http_error_1.BadRequest)(`Invalid rule(s): ${problems.map((p) => `${p.ruleId}: ${p.errors.join('; ')}`).join(' | ')}`);
        await prisma_1.prisma.testApp.update({ where: { id }, data: { settings: (0, prisma_1.json)({ ...settingsOf(app), customRules: input.custom, disabledRules: input.disabled }) } });
        return { ok: true, note: 'Rules apply the next time you regenerate.' };
    },
    /** Dry run: what would these rules do to the current collection? Nothing is saved. */
    async previewRules(userId, id, input) {
        const app = await access(userId, id);
        const overrides = toOverrides(await prisma_1.prisma.testAppOverride.findMany({ where: { testAppId: id } }));
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
    async remove(userId, id) {
        await access(userId, id, true);
        await prisma_1.prisma.testApp.delete({ where: { id } });
    },
    async setOverride(userId, id, target, decision) {
        await access(userId, id, true);
        return prisma_1.prisma.testAppOverride.upsert({ where: { testAppId_target: { testAppId: id, target } }, create: { testAppId: id, target, decision: (0, prisma_1.json)(decision), createdById: userId }, update: { decision: (0, prisma_1.json)(decision) } });
    },
    async removeOverride(userId, id, target) {
        await access(userId, id, true);
        await prisma_1.prisma.testAppOverride.deleteMany({ where: { testAppId: id, target } });
    },
    /** Impact report (preview) or a new immutable version. Approved overrides are re-applied, never dropped silently. */
    async regenerate(userId, id, opts) {
        const app = await access(userId, id, true);
        const current = await version(id, app.currentVersionId);
        const overrides = toOverrides(await prisma_1.prisma.testAppOverride.findMany({ where: { testAppId: id } }));
        const seed = opts.seed ?? current.seed;
        const { bundle, sourceHash } = await buildFromCollection(app.collectionId, overrides, seed, app.settings);
        const before = bundleOf(current);
        const beforeScreens = new Set(before.schema.screens.map((s) => s.id));
        const afterScreens = new Set(bundle.schema.screens.map((s) => s.id));
        const impact = {
            sourceChanged: sourceHash !== current.sourceHash,
            contractChanges: (0, contract_1.diffContracts)(before.contract, bundle.contract),
            screensAdded: [...afterScreens].filter((s) => !beforeScreens.has(s)),
            screensRemoved: [...beforeScreens].filter((s) => !afterScreens.has(s)),
            orphanOverrides: orphanOverrides(bundle, overrides),
            appliedOverrides: overrides.length,
        };
        if (opts.preview)
            return { impact, ...summary(bundle) };
        const created = await exports.testAppService.saveVersion(id, current.version + 1, bundle, sourceHash, seed, userId);
        await prisma_1.prisma.testApp.update({ where: { id }, data: { currentVersionId: created.id } });
        const old = await prisma_1.prisma.testAppVersion.findMany({ where: { testAppId: id }, orderBy: { version: 'desc' }, skip: exports.TESTAPP_LIMITS.versionsPerApp, select: { id: true } });
        if (old.length)
            await prisma_1.prisma.testAppVersion.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
        return { impact, version: { id: created.id, version: created.version }, ...summary(bundle) };
    },
    /* ----------------------------- sessions ----------------------------- */
    async createSession(userId, id, input) {
        const app = await access(userId, id);
        const v = await version(id, input.versionId || app.currentVersionId);
        const seed = input.seed ?? v.seed;
        const state = (0, mock_1.createInitialState)(ctxOf(v, app.settings), seed);
        const mine = await prisma_1.prisma.testAppSession.findMany({ where: { testAppId: id, ownerId: userId }, orderBy: { createdAt: 'desc' }, skip: exports.TESTAPP_LIMITS.sessionsPerUserApp - 1, select: { id: true } });
        if (mine.length)
            await prisma_1.prisma.testAppSession.deleteMany({ where: { id: { in: mine.map((m) => m.id) } } });
        const s = await prisma_1.prisma.testAppSession.create({ data: { testAppId: id, versionId: v.id, ownerId: userId, seed, state: (0, prisma_1.json)(state), logs: [], expiresAt: new Date(Date.now() + exports.TESTAPP_LIMITS.sessionTtlMs) } });
        return { id: s.id, versionId: v.id, seed, expiresAt: s.expiresAt };
    },
    /** Session for a public share visitor (no user). */
    async createAnonymousSession(testAppId, versionId, ownerId, shareId, seed, ttlMs) {
        const app = await prisma_1.prisma.testApp.findUniqueOrThrow({ where: { id: testAppId } });
        const v = await prisma_1.prisma.testAppVersion.findUniqueOrThrow({ where: { id: versionId } });
        const useSeed = seed ?? v.seed;
        const state = (0, mock_1.createInitialState)(ctxOf(v, app.settings), useSeed);
        const s = await prisma_1.prisma.testAppSession.create({ data: { testAppId, versionId, ownerId, shareId, seed: useSeed, state: (0, prisma_1.json)(state), logs: [], expiresAt: new Date(Date.now() + ttlMs) } });
        return { id: s.id, seed: useSeed, expiresAt: s.expiresAt };
    },
    async session(userId, id, sessionId) {
        const app = await access(userId, id);
        const s = await prisma_1.prisma.testAppSession.findUnique({ where: { id: sessionId } });
        if (!s || s.testAppId !== id || s.ownerId !== userId)
            throw (0, http_error_1.NotFound)('Session not found');
        if (s.expiresAt < new Date())
            throw (0, http_error_1.NotFound)('Session expired');
        return { app, s };
    },
    async invoke(userId, id, sessionId, input) {
        const { app, s } = await exports.testAppService.session(userId, id, sessionId);
        return exports.testAppService.invokeOnSession(app, s, input);
    },
    /** Runs one mock call on a loaded session (owner checks are the caller's job). */
    async invokeOnSession(app, s, input) {
        const v = await prisma_1.prisma.testAppVersion.findUniqueOrThrow({ where: { id: s.versionId } });
        const schema = v.schema;
        const action = input.actionId ? schema.actions[input.actionId] : undefined;
        if (input.actionId && !action)
            throw (0, http_error_1.NotFound)('Action not found in this version');
        const endpoint = action?.endpoint || input.endpoint;
        const fromValues = action ? requestFromAction(action, input.values) : { pathParams: {}, query: {}, body: {}, rawBody: undefined };
        const hasValuesBody = Object.keys(fromValues.body).length > 0;
        const req = {
            endpoint,
            pathParams: { ...fromValues.pathParams, ...(input.pathParams || {}) },
            query: { ...fromValues.query, ...(input.query || {}) },
            body: input.body !== undefined ? input.body : fromValues.rawBody !== undefined ? fromValues.rawBody : hasValuesBody ? fromValues.body : undefined,
            scenario: input.scenario,
        };
        const started = Date.now();
        const ctx = ctxOf(v, app.settings);
        const source = action?.kind === 'request' && ctx.model.endpoints.find((entry) => entry.key === endpoint);
        const selectedExample = source && (0, generate_1.savedResponse)(source, input.values.savedExample);
        const savedExample = selectedExample && s.shareId ? { ...selectedExample, headers: {}, body: (0, ai_1.redact)(selectedExample.body) } : selectedExample;
        const state = s.state;
        const out = source ? {
            state,
            result: { ...(savedExample || { status: 501, headers: {}, body: 'No saved response for this request.' }), endpoint, role: 'request', provenance: savedExample ? 'documented' : 'unknown', trace: [savedExample ? 'Replayed saved collection response' : 'No saved response'] },
        } : (0, mock_1.invoke)(ctx, state, req);
        const log = { ts: new Date().toISOString(), actionId: input.actionId, endpoint: out.result.endpoint || endpoint, role: out.result.role, request: req, status: out.result.status, scenario: input.scenario || 'success', provenance: out.result.provenance, trace: out.result.trace, durationMs: Date.now() - started };
        if (source) {
            return { request: req, response: { status: out.result.status, headers: out.result.headers, body: out.result.body }, trace: out.result.trace, provenance: out.result.provenance, role: out.result.role, endpoint, actionId: input.actionId, durationMs: log.durationMs, loggedIn: false };
        }
        const logs = [...(Array.isArray(s.logs) ? s.logs : []), log].slice(-exports.TESTAPP_LIMITS.logEntries);
        const saved = await prisma_1.prisma.testAppSession.updateMany({ where: { id: s.id, rev: s.rev }, data: { state: (0, prisma_1.json)(out.state), logs: (0, prisma_1.json)(logs), rev: { increment: 1 }, lastSeenAt: new Date(), expiresAt: new Date(Date.now() + exports.TESTAPP_LIMITS.sessionTtlMs) } });
        if (!saved.count)
            throw (0, http_error_1.Conflict)('The session changed in another tab; retry the request.');
        return { request: req, response: { status: out.result.status, headers: out.result.headers, body: out.result.body }, trace: out.result.trace, provenance: out.result.provenance, role: out.result.role, endpoint: out.result.endpoint, actionId: input.actionId, durationMs: log.durationMs, loggedIn: !!out.state.current };
    },
    async reset(userId, id, sessionId, seed) {
        const { app, s } = await exports.testAppService.session(userId, id, sessionId);
        return exports.testAppService.resetSession(app, s, seed);
    },
    async resetSession(app, s, seed) {
        const v = await prisma_1.prisma.testAppVersion.findUniqueOrThrow({ where: { id: s.versionId } });
        const nextSeed = seed ?? s.seed;
        await prisma_1.prisma.testAppSession.update({ where: { id: s.id }, data: { state: (0, prisma_1.json)((0, mock_1.createInitialState)(ctxOf(v, app.settings), nextSeed)), seed: nextSeed, logs: [], rev: { increment: 1 } } });
        return { ok: true, seed: nextSeed };
    },
    async logs(userId, id, sessionId) {
        const { s } = await exports.testAppService.session(userId, id, sessionId);
        return s.logs || [];
    },
    async stateSummary(userId, id, sessionId) {
        const { s } = await exports.testAppService.session(userId, id, sessionId);
        const st = s.state;
        return { rev: st.rev, seed: st.seed, loggedIn: !!st.current, tables: Object.fromEntries(Object.entries(st.tables).map(([k, v]) => [k, v.length])) };
    },
    /* ----------------------------- test runs ----------------------------- */
    async run(userId, id, opts = {}) {
        const app = await access(userId, id, true);
        const v = await version(id, app.currentVersionId);
        const mode = opts.mode || 'mock';
        const bundle = bundleOf(v);
        let results;
        let extra = {};
        if (mode === 'mock') {
            results = (0, testing_1.runMockTests)(bundle, { seed: v.seed, customTests: settingsOf(app).customTests }).results;
        }
        else {
            (0, real_service_1.assertRealEnabled)(app);
            const real = await exports.testAppService.runAgainstReal(userId, app, bundle, v.seed, mode, opts);
            results = real.results;
            extra = { hosts: real.hosts, calls: real.calls };
        }
        const count = (s) => results.filter((r) => r.status === s).length;
        const stats = { total: results.length, passed: count('passed'), failed: count('failed'), warnings: count('warning'), skipped: count('skipped') };
        const coverage = (0, testing_1.coverageOf)(bundle, results);
        // regression: compare with the previous run of the same mode
        const prev = await prisma_1.prisma.testRun.findFirst({ where: { testAppId: id, mode }, orderBy: { createdAt: 'desc' } });
        const regression = prev ? (0, testing_1.compareRuns)((prev.results || []), results) : null;
        const row = await prisma_1.prisma.testRun.create({ data: { testAppId: id, versionId: v.id, mode, stats: (0, prisma_1.json)({ ...stats, regression: regression && { newFailures: regression.newFailures.length, fixed: regression.fixed.length } }), results: (0, prisma_1.json)(results), coverage: (0, prisma_1.json)({ ...coverage, regression, ...extra }), startedById: userId } });
        const old = await prisma_1.prisma.testRun.findMany({ where: { testAppId: id }, orderBy: { createdAt: 'desc' }, skip: exports.TESTAPP_LIMITS.runsPerApp, select: { id: true } });
        if (old.length)
            await prisma_1.prisma.testRun.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
        return { id: row.id, createdAt: row.createdAt, version: v.version, mode, results, stats, coverage: { ...coverage, regression }, regression, ...extra };
    },
    /** Real / comparison runs: only documented-safe calls by default, bounded in count and time. */
    async runAgainstReal(userId, app, bundle, seed, mode, opts) {
        const context = await (0, real_service_1.loadRealContext)(userId, app);
        const probe = mode === 'compare' ? (0, testing_1.createMockProbe)(bundle, seed) : null;
        const results = [];
        const hosts = new Set();
        const started = Date.now();
        let calls = 0;
        const add = (r) => results.push({ id: `T${String(results.length + 1).padStart(3, '0')}`, mode, ...r });
        const candidates = bundle.model.endpoints.filter((e) => !['excluded', 'background'].includes(bundle.schema.dispositions[e.key]?.state) && !['auth.login', 'auth.logout', 'auth.refresh'].includes(bundle.graph.roles[e.key]?.role));
        for (const e of candidates) {
            const documented = [...new Set(e.examples.map((x) => x.code))];
            const actionId = Object.values(bundle.schema.actions).find((a) => a.endpoint === e.key)?.id;
            const base = { endpoint: e.key, action: actionId };
            if (!e.examples.some((x) => x.code >= 200 && x.code < 300))
                continue; // nothing documented to verify
            if (calls >= real_service_1.REAL_LIMITS.maxEndpointsPerRun || Date.now() - started > real_service_1.REAL_LIMITS.runBudgetMs) {
                add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: 'skipped', expected: 'a real call', actual: 'not run', certainty: 'inferred', error: 'Run limit reached (40 endpoints or 2 minutes per run). Run again for the rest.' });
                continue;
            }
            if (!(0, real_1.isSafeMethod)(e.method) && !opts.confirmUnsafe) {
                add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: 'skipped', expected: 'a real call', actual: 'not run', certainty: 'inferred', error: `${e.method} changes data and was not confirmed for this run.` });
                continue;
            }
            calls++;
            const out = await (0, real_service_1.executeReal)({ userId, app, endpoint: e, confirmUnsafe: opts.confirmUnsafe, confirmProduction: opts.confirmProduction, context });
            if (out.kind !== 'ok') {
                add({ ...base, name: `${e.key} against the real API`, type: 'contract', status: out.kind === 'error' ? 'failed' : 'skipped', expected: 'a real response', actual: out.kind, certainty: 'verified', error: out.reason });
                continue;
            }
            try {
                hosts.add(new URL(out.url).host);
            }
            catch {
                /* ignore */
            }
            const contract = bundle.contract.endpoints[e.key];
            if (probe) {
                const mock = probe(e.key);
                const cmp = (0, real_1.compareResponses)({ mock: { status: mock.status, body: mock.body }, real: { status: out.status, body: out.body }, documentedCodes: documented, contract });
                add({ ...base, name: `${e.key}: mock vs real`, type: 'contract', status: cmp.status, expected: cmp.expected, actual: cmp.actual, certainty: cmp.certainty, error: cmp.error, evidence: { request: { url: out.url }, response: { mockStatus: mock.status, realStatus: out.status, differences: cmp.diffs.slice(0, 30) } } });
            }
            else {
                const schema = contract?.responses[String(out.status)]?.schema;
                const issues = schema ? (0, contract_2.validateAgainst)(schema, out.body) : [];
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
    async realInvoke(userId, id, input) {
        const app = await access(userId, id, true);
        (0, real_service_1.assertRealEnabled)(app);
        const v = await version(id, app.currentVersionId);
        const schema = v.schema;
        const action = schema.actions[input.actionId];
        if (!action)
            throw (0, http_error_1.NotFound)('Action not found in this version');
        const endpoint = v.model.endpoints.find((e) => e.key === action.endpoint);
        if (!endpoint)
            throw (0, http_error_1.NotFound)('Endpoint not found');
        const req = requestFromAction(action, input.values);
        const started = Date.now();
        const out = await (0, real_service_1.executeReal)({ userId, app, endpoint, values: { pathParams: req.pathParams, query: req.query, queryEntries: action.kind === 'request' ? req.queryEntries : undefined, body: req.rawBody ?? (Object.keys(req.body).length ? req.body : undefined), headers: req.headers, rawBody: req.rawBody !== undefined, form: action.kind === 'request' ? req.body : undefined }, confirmUnsafe: input.confirmUnsafe, confirmProduction: input.confirmProduction });
        if (out.kind !== 'ok') {
            if (out.kind === 'blocked')
                throw (0, http_error_1.Forbidden)(out.reason);
            throw (0, http_error_1.BadRequest)(out.reason);
        }
        const response = { status: out.status, headers: out.headers, body: out.body };
        const expected = action.kind === 'request' ? (0, generate_1.savedResponse)(endpoint, input.values.savedExample) : undefined;
        const comparison = expected ? (0, real_1.compareResponses)({ mock: expected, real: response, documentedCodes: [expected.status], contract: bundleOf(v).contract.endpoints[endpoint.key] }) : undefined;
        return { request: { endpoint: endpoint.key, url: out.url, pathParams: req.pathParams, query: req.query, body: req.rawBody ?? req.body }, response, comparison, trace: ['sent to the REAL backend (allowlisted host)'], provenance: 'real', role: undefined, endpoint: endpoint.key, actionId: input.actionId, durationMs: Date.now() - started, loggedIn: false };
    },
    async runs(userId, id) {
        await access(userId, id);
        return prisma_1.prisma.testRun.findMany({ where: { testAppId: id }, orderBy: { createdAt: 'desc' }, take: 50, select: { id: true, mode: true, stats: true, versionId: true, createdAt: true } });
    },
    async getRun(userId, id, runId) {
        await access(userId, id);
        const r = await prisma_1.prisma.testRun.findUnique({ where: { id: runId } });
        if (!r || r.testAppId !== id)
            throw (0, http_error_1.NotFound)('Run not found');
        const v = await prisma_1.prisma.testAppVersion.findUnique({ where: { id: r.versionId }, select: { version: true, sourceHash: true, contractVersion: true, ruleSetVersion: true, seed: true } });
        return { ...r, versionInfo: v };
    },
    async reportMarkdown(userId, id, runId) {
        const r = await exports.testAppService.getRun(userId, id, runId);
        const app = await prisma_1.prisma.testApp.findUniqueOrThrow({ where: { id } });
        const stats = (r.stats || {});
        const results = (r.results || []);
        const esc = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
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
    async coverage(userId, id) {
        const app = await access(userId, id);
        const v = await version(id, app.currentVersionId);
        const out = (0, testing_1.runMockTests)(bundleOf(v), { seed: v.seed });
        return out.coverage;
    },
};
async function pruneTestAppSessions() {
    await prisma_1.prisma.testAppSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}
