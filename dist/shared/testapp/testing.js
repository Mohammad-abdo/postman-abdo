"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runMockTests = runMockTests;
exports.coverageOf = coverageOf;
exports.createMockProbe = createMockProbe;
exports.compareRuns = compareRuns;
const contract_1 = require("./contract");
const mock_1 = require("./mock");
const ui_helpers_1 = require("./ui-helpers");
const util_1 = require("./util");
const ROLE_ORDER = ['auth.login', 'auth.session', 'list', 'nested-list', 'search', 'get', 'nested-get', 'action', 'auth.refresh', 'create', 'nested-create', 'update', 'patch', 'nested-update', 'unknown', 'delete', 'nested-delete', 'auth.logout'];
const trunc = (v) => {
    const s = typeof v === 'string' ? v : JSON.stringify(v);
    return s && s.length > 2000 ? s.slice(0, 2000) + '…' : v;
};
function runMockTests(bundle, opts = {}) {
    const ctx = { model: bundle.model, contract: bundle.contract, graph: bundle.graph };
    const results = [];
    let state = (0, mock_1.createInitialState)(ctx, opts.seed ?? bundle.schema.app.seed);
    let token;
    const byKey = new Map(bundle.model.endpoints.map((e) => [e.key, e]));
    const call = (req) => {
        const out = (0, mock_1.invoke)(ctx, state, { token, ...req });
        state = out.state;
        return out.result;
    };
    const add = (r) => results.push({ id: `T${String(results.length + 1).padStart(3, '0')}`, mode: 'mock', ...r });
    const login = bundle.graph.authLogin ? byKey.get(bundle.graph.authLogin) : undefined;
    const doLogin = () => {
        if (!login)
            return;
        const res = call({ endpoint: login.key, body: login.body.example });
        token = JSON.stringify(res.body).match(/MOCK-[0-9a-f]+/)?.[0];
    };
    doLogin();
    const requestFor = (e) => {
        const info = bundle.graph.roles[e.key];
        const pathParams = {};
        const row = info.resource ? state.tables[info.resource]?.[0] : undefined;
        const parentRes = bundle.graph.resources.find((r) => r.id === info.resource)?.parent;
        const parentRow = parentRes ? state.tables[parentRes]?.[0] : undefined;
        e.pathParams.forEach((p, i) => {
            const last = i === e.pathParams.length - 1;
            const src = last && !info.role.startsWith('nested') ? row : info.role.startsWith('nested') && !last ? parentRow : row;
            const idf = info.resource ? state.idFields[last ? info.resource : parentRes || info.resource] : undefined;
            pathParams[p.name] = String(src && idf ? src[idf] : p.example || '1');
        });
        const query = {};
        e.query.forEach((q) => q.example !== undefined && (query[q.name] = q.example));
        return { endpoint: e.key, pathParams, query, body: (0, util_1.clone)(e.body.example) };
    };
    /* ---- contract tests (one per endpoint with a saved 2xx example) ---- */
    const live = bundle.model.endpoints.filter((e) => !['excluded', 'background'].includes(bundle.schema.dispositions[e.key]?.state));
    const ordered = [...live].sort((a, b) => ROLE_ORDER.indexOf(bundle.graph.roles[a.key].role) - ROLE_ORDER.indexOf(bundle.graph.roles[b.key].role) || a.order - b.order);
    for (const e of ordered) {
        const info = bundle.graph.roles[e.key];
        const ex = e.examples.find((x) => x.code >= 200 && x.code < 300);
        const actionId = Object.values(bundle.schema.actions).find((a) => a.endpoint === e.key)?.id;
        if (!ex) {
            add({ name: `${e.key} matches contract`, type: 'contract', endpoint: e.key, action: actionId, status: 'skipped', expected: 'a saved 2xx example', actual: 'none', certainty: 'inferred', error: 'No saved example: response schema is unknown, nothing to verify.' });
            continue;
        }
        const req = requestFor(e);
        const res = call(req);
        const issues = ex.body !== undefined ? (0, contract_1.validateAgainst)(bundle.contract.endpoints[e.key].responses[String(ex.code)]?.schema, res.body) : [];
        const statusOk = res.status === ex.code;
        const errors = issues.filter((i) => i.severity === 'error');
        add({
            name: `${e.key} matches contract`, type: 'contract', endpoint: e.key, action: actionId,
            status: !statusOk || errors.length ? 'failed' : issues.length ? 'warning' : 'passed',
            expected: `status ${ex.code}${ex.body !== undefined ? ' + body shaped like the saved example' : ''}`,
            actual: `status ${res.status}${issues.length ? `; ${issues.length} schema note(s)` : ''}`,
            certainty: issues.length && !errors.length ? 'inferred' : 'verified',
            error: [...(statusOk ? [] : [`Expected ${ex.code}, got ${res.status}`]), ...issues.slice(0, 5).map((i) => `${i.path}: ${i.message}`)].join('; ') || undefined,
            evidence: { request: trunc(req), response: trunc({ status: res.status, body: res.body, trace: res.trace }) },
        });
        void info;
    }
    doLogin(); // the logout test above invalidated the first token
    /* ---- mapping tests ---- */
    const s = bundle.schema;
    for (const a of Object.values(s.actions)) {
        const e = byKey.get(a.endpoint);
        add({ name: `Action ${a.id} points to a real endpoint`, type: 'mapping', endpoint: a.endpoint, action: a.id, status: e ? 'passed' : 'failed', expected: 'endpoint exists in the contract', actual: e ? e.key : 'missing', certainty: 'verified' });
        if (e) {
            const bad = a.inputs.filter((f) => f.in === 'path' && !e.pathParams.some((p) => p.name === f.name));
            add({ name: `Action ${a.id} inputs bind to request parameters`, type: 'mapping', endpoint: a.endpoint, action: a.id, status: bad.length ? 'failed' : 'passed', expected: 'every path input exists on the endpoint', actual: bad.length ? `unknown: ${bad.map((b) => b.name).join(', ')}` : 'ok', certainty: 'verified' });
        }
    }
    for (const sc of s.screens) {
        const missing = sc.components.filter((c) => c.action && !s.actions[c.action]);
        add({ name: `Screen ${sc.id} components reference existing actions`, type: 'mapping', screen: sc.id, status: missing.length ? 'failed' : 'passed', expected: 'all component actions exist', actual: missing.length ? missing.map((m) => m.id).join(', ') : 'ok', certainty: 'verified' });
        const noSources = sc.sources.filter((k) => !byKey.has(k));
        if (noSources.length)
            add({ name: `Screen ${sc.id} sources exist`, type: 'mapping', screen: sc.id, status: 'failed', expected: 'sources exist', actual: noSources.join(', '), certainty: 'verified' });
    }
    for (const e of bundle.model.endpoints) {
        add({ name: `${e.key} is accounted for`, type: 'mapping', endpoint: e.key, status: s.dispositions[e.key] ? 'passed' : 'failed', expected: 'mapped, explorer, background or excluded', actual: s.dispositions[e.key]?.state || 'unmapped', certainty: 'verified' });
    }
    /* ---- auth tests ---- */
    if (login) {
        const protectedEp = bundle.model.endpoints.find((e) => e.auth.type !== 'noauth' && e.key !== login.key && bundle.graph.roles[e.key].role !== 'auth.login' && live.includes(e));
        if (protectedEp) {
            const saved = token;
            token = undefined;
            const res = call({ ...requestFor(protectedEp), token: '' });
            token = saved;
            add({ name: `${protectedEp.key} rejects calls without a token`, type: 'auth', endpoint: protectedEp.key, status: res.status === 401 || res.status === 403 ? 'passed' : 'failed', expected: '401/403', actual: String(res.status), certainty: 'inferred' });
        }
        add({ name: 'Login issues a synthetic token', type: 'auth', endpoint: login.key, status: token ? 'passed' : 'failed', expected: 'MOCK-… token in the response', actual: token ? 'token issued' : 'no token found', certainty: 'inferred' });
    }
    /* ---- state tests (CRUD) ---- */
    for (const r of bundle.graph.resources.filter((x) => !x.parent)) {
        const role = (n) => r.endpoints.find((x) => x.role === n);
        const create = role('create');
        const get = role('get');
        if (!create || !get)
            continue;
        const ce = byKey.get(create.key);
        const ge = byKey.get(get.key);
        const created = call({ endpoint: ce.key, body: (0, util_1.clone)(ce.body.example) ?? {} });
        const body = created.body;
        const rec = (0, util_1.isObj)(body) ? Object.values(body).find(util_1.isObj) || body : undefined;
        const idf = state.idFields[r.id] || 'id';
        const id = rec?.[idf] ?? state.tables[r.id]?.[state.tables[r.id].length - 1]?.[idf];
        const read = call({ endpoint: ge.key, pathParams: { [ge.pathParams[ge.pathParams.length - 1]?.name || 'id']: String(id) } });
        add({ name: `${r.name}: created record can be read back`, type: 'state', endpoint: ge.key, status: read.status < 300 ? 'passed' : 'failed', expected: '2xx on GET after POST', actual: String(read.status), certainty: 'inferred', evidence: { request: trunc({ id }), response: trunc(read.body) } });
        const del = role('delete');
        if (del) {
            const de = byKey.get(del.key);
            call({ endpoint: de.key, pathParams: { [de.pathParams[de.pathParams.length - 1]?.name || 'id']: String(id) } });
            const gone = call({ endpoint: ge.key, pathParams: { [ge.pathParams[ge.pathParams.length - 1]?.name || 'id']: String(id) } });
            add({ name: `${r.name}: deleted record returns not found`, type: 'state', endpoint: ge.key, status: gone.status === 404 ? 'passed' : 'failed', expected: '404 after DELETE', actual: String(gone.status), certainty: 'inferred' });
        }
    }
    /* ---- workflow tests ---- */
    doLogin();
    for (const wf of bundle.schema.workflows) {
        const failures = [];
        const trail = [];
        for (const step of wf.steps) {
            const action = bundle.schema.actions[step];
            const e = action && byKey.get(action.endpoint);
            if (!e) {
                failures.push(`${step}: action or endpoint missing`);
                continue;
            }
            const res = call(requestFor(e));
            trail.push({ step, status: res.status });
            if (res.status >= 400)
                failures.push(`${step} → ${res.status}`);
        }
        add({ name: `Workflow: ${wf.name}`, type: 'workflow', status: failures.length ? 'failed' : 'passed', expected: 'every step succeeds in order', actual: failures.length ? failures.join('; ') : `${wf.steps.length} steps ok`, certainty: 'inferred', evidence: { request: wf.steps, response: trail } });
        doLogin();
    }
    /* ---- negative tests ---- */
    const WITH_ID = new Set(['get', 'update', 'patch', 'delete', 'nested-get', 'nested-update', 'nested-delete']);
    for (const e of live) {
        const role = bundle.graph.roles[e.key].role;
        const actionId = Object.values(bundle.schema.actions).find((a) => a.endpoint === e.key)?.id;
        if (login && e.auth.type !== 'noauth' && role !== 'auth.login' && bundle.schema.dispositions[e.key]?.state !== 'explorer') {
            const res = call({ ...requestFor(e), token: '' });
            add({ name: `${e.key} rejects calls without a token`, type: 'negative', endpoint: e.key, action: actionId, status: res.status === 401 || res.status === 403 ? 'passed' : 'failed', expected: '401/403', actual: String(res.status), certainty: 'inferred' });
        }
        if (WITH_ID.has(role) && e.pathParams.length) {
            const req = requestFor(e);
            req.pathParams = { ...req.pathParams, [e.pathParams[e.pathParams.length - 1].name]: '__missing__' };
            const res = call(req);
            const documented = e.examples.some((x) => x.code === 404);
            add({ name: `${e.key} returns not found for an unknown id`, type: 'negative', endpoint: e.key, action: actionId, status: res.status === 404 ? 'passed' : 'failed', expected: '404', actual: String(res.status), certainty: documented ? 'verified' : 'inferred' });
        }
        for (const ex of e.examples.filter((x) => x.code >= 400)) {
            const scenario = ex.code === 401 || ex.code === 403 ? 'unauthorized' : ex.code === 404 ? 'notFound' : ex.code >= 500 ? 'serverError' : ex.code === 400 || ex.code === 422 ? 'validation' : null;
            if (!scenario)
                continue;
            const res = call({ ...requestFor(e), scenario });
            const same = res.status === ex.code && (ex.body === undefined || JSON.stringify(res.body) === JSON.stringify(ex.body));
            add({ name: `${e.key} replays documented ${ex.code} "${ex.name}"`, type: 'negative', endpoint: e.key, action: actionId, status: same ? 'passed' : 'failed', expected: `status ${ex.code} and the saved body`, actual: `status ${res.status}`, certainty: 'verified', evidence: same ? undefined : { response: trunc(res.body) } });
        }
        if (role === 'list' || role === 'nested-list') {
            const res = call({ ...requestFor(e), scenario: 'empty' });
            const list = (0, ui_helpers_1.findList)(res.body);
            const arr = list && (list.path === '$' ? res.body : (0, util_1.getPath)(res.body, list.path));
            add({ name: `${e.key} supports an empty result`, type: 'negative', endpoint: e.key, action: actionId, status: Array.isArray(arr) && arr.length === 0 ? 'passed' : 'warning', expected: 'empty list', actual: Array.isArray(arr) ? `${arr.length} items` : 'no list found in the response', certainty: 'inferred' });
        }
    }
    doLogin();
    /* ---- user-defined / accepted tests ---- */
    for (const t of opts.customTests || []) {
        const e = byKey.get(t.endpoint);
        if (!e) {
            add({ name: t.name, type: 'custom', endpoint: t.endpoint, status: 'failed', expected: `endpoint ${t.endpoint}`, actual: 'not in the contract', certainty: 'verified', error: 'The test references an endpoint that no longer exists.' });
            continue;
        }
        const base = requestFor(e);
        const res = call({ ...base, pathParams: { ...base.pathParams, ...(t.pathParams || {}) }, query: { ...base.query, ...(t.query || {}) }, body: t.body !== undefined ? t.body : base.body, scenario: t.scenario, ...(t.noAuth ? { token: '' } : {}) });
        const problems = [];
        if (res.status !== t.expectStatus)
            problems.push(`status ${res.status}, expected ${t.expectStatus}`);
        for (const k of t.expectBodyKeys || [])
            if ((0, util_1.getPath)(res.body, `$.${k}`) === undefined)
                problems.push(`missing ${k}`);
        add({ name: t.name, type: 'custom', endpoint: e.key, status: problems.length ? 'failed' : 'passed', expected: `status ${t.expectStatus}${t.expectBodyKeys?.length ? ` with ${t.expectBodyKeys.join(', ')}` : ''}`, actual: problems.length ? problems.join('; ') : `status ${res.status}`, certainty: 'verified', evidence: { origin: t.origin || 'user', request: trunc(t), response: trunc(res.body) } });
    }
    const stats = {
        total: results.length,
        passed: results.filter((r) => r.status === 'passed').length,
        failed: results.filter((r) => r.status === 'failed').length,
        warnings: results.filter((r) => r.status === 'warning').length,
        skipped: results.filter((r) => r.status === 'skipped').length,
    };
    return { results, stats, coverage: coverageOf(bundle, results) };
}
/** Coverage never equates "screens generated" with API coverage: every endpoint is classified separately. */
function coverageOf(bundle, results = []) {
    const s = bundle.schema;
    const kind = (k) => {
        const d = s.dispositions[k];
        if (!d)
            return 'unmapped';
        if (d.state !== 'mapped')
            return d.state;
        return s.screens.some((sc) => sc.sources.includes(k)) ? 'screen' : 'action';
    };
    const c = { total: bundle.model.endpoints.length, screen: 0, action: 0, explorer: 0, background: 0, excluded: 0, unmapped: [], untested: [] };
    bundle.model.endpoints.forEach((e) => {
        const k = kind(e.key);
        if (k === 'unmapped')
            c.unmapped.push(e.key);
        else
            c[k]++;
        if (!['excluded', 'background'].includes(k) && !results.some((r) => r.type === 'contract' && r.endpoint === e.key && r.status !== 'skipped'))
            c.untested.push(e.key);
    });
    return c;
}
/** Calls the mock for one endpoint exactly like the generated tests do (logged in, realistic ids). Used by mock-vs-real comparison. */
function createMockProbe(bundle, seed = bundle.schema.app.seed) {
    const ctx = { model: bundle.model, contract: bundle.contract, graph: bundle.graph };
    let state = (0, mock_1.createInitialState)(ctx, seed);
    const byKey = new Map(bundle.model.endpoints.map((e) => [e.key, e]));
    if (bundle.graph.authLogin) {
        const login = byKey.get(bundle.graph.authLogin);
        state = (0, mock_1.invoke)(ctx, state, { endpoint: login.key, body: login.body.example }).state;
    }
    return (key) => {
        const e = byKey.get(key);
        const info = bundle.graph.roles[key];
        const pathParams = {};
        const parentRes = bundle.graph.resources.find((r) => r.id === info.resource)?.parent;
        e.pathParams.forEach((p, i) => {
            const last = i === e.pathParams.length - 1;
            const res = info.role.startsWith('nested') && !last ? parentRes : info.resource;
            const row = res ? state.tables[res]?.[0] : undefined;
            const idf = res ? state.idFields[res] : undefined;
            pathParams[p.name] = String(row && idf ? row[idf] : p.example || '1');
        });
        const query = {};
        e.query.forEach((q) => q.example !== undefined && (query[q.name] = q.example));
        const out = (0, mock_1.invoke)(ctx, state, { endpoint: key, pathParams, query, body: (0, util_1.clone)(e.body.example) });
        state = out.state;
        return out.result;
    };
}
/** Compares two runs by test identity (type + name). Detects behaviour changes between versions. */
function compareRuns(prev, next) {
    const key = (r) => `${r.type}|${r.name}`;
    const p = new Map(prev.map((r) => [key(r), r]));
    const n = new Map(next.map((r) => [key(r), r]));
    const out = { newFailures: [], fixed: [], added: [], removed: [], statusChanges: [] };
    n.forEach((r, k) => {
        const old = p.get(k);
        if (!old) {
            out.added.push(r.name);
            return;
        }
        if (old.status !== r.status) {
            out.statusChanges.push({ test: r.name, from: old.status, to: r.status });
            if (r.status === 'failed')
                out.newFailures.push(r.name);
            if (old.status === 'failed')
                out.fixed.push(r.name);
        }
    });
    p.forEach((r, k) => {
        if (!n.has(k))
            out.removed.push(r.name);
    });
    return out;
}
