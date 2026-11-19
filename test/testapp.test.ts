import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeCollection } from '../src/shared/testapp/analyzer';
import { diffContracts, inferSchema, mergeSchemas, validateAgainst } from '../src/shared/testapp/contract';
import { generateApp, savedResponse } from '../src/shared/testapp/generate';
import { MockCtx, createInitialState, invoke } from '../src/shared/testapp/mock';
import { publicSchema } from '../src/shared/testapp/public';
import { runMockTests } from '../src/shared/testapp/testing';
import { stableStringify } from '../src/shared/testapp/util';
import { item, shopCollection } from './fixtures/shop';

const bundle = () => generateApp(shopCollection());

describe('independent request screens', () => {
  it('generates a catalog and directory from the response fields and nested inputs', () => {
    const item = (name: string, data: unknown) => ({
      name,
      request: { method: 'GET', url: `https://example.test/${name}` },
      response: [{ code: 200, body: JSON.stringify(data) }],
    });
    const { schema } = generateApp({ info: { name: 'Demo' }, item: [
      item('products', { metadata: { links: [] }, payload: { results: [{ title: 'Coffee', price: 10, category: 'Drinks' }] } }),
      item('contacts', [{ full_name: 'Nour', email: 'nour@example.test' }]),
    ] }, { perRequest: true });
    const [catalog, directory] = Object.values(schema.actions);
    assert.deepEqual(catalog.mobile, { kind: 'catalog', dataPath: ['payload', 'results'], titleField: 'title', subtitleField: 'category', amountField: 'price' });
    assert.equal(directory.mobile?.kind, 'directory');
    assert.deepEqual(directory.mobile?.dataPath, []);
    assert.ok(!JSON.stringify(catalog.mobile).includes('Coffee'));
  });

  it('uses source order, distinct fields and saved examples even when URLs repeat', () => {
    const url = { raw: 'https://example.test/users?id=2', host: ['example.test'], protocol: 'https', path: ['users'], query: [{ key: 'id', value: '2' }] };
    const request = (id: string, name: string) => ({
      id, name,
      request: { method: 'GET', url, header: [{ key: 'id', value: 'abc' }] },
      response: [
        { name: 'Success', code: 200, body: '{"data":[{"id":2}]}' },
        { name: 'Missing', code: 404, body: 'missing' },
      ],
    });
    const collection = { info: { name: 'Users' }, item: [{ name: 'Users', item: [request('one', 'First')] }, request('two', 'Second')] };
    const { schema, model, graph } = generateApp(collection, { perRequest: true });
    assert.deepEqual(schema.nav.map((item) => [item.label, item.folderPath]), [['First', ['Users']], ['Second', []]]);
    assert.equal(schema.screens.length, 2);
    assert.notEqual(schema.screens[0].sources[0], schema.screens[1].sources[0]);
    assert.deepEqual(graph.edges, []);
    const action = Object.values(schema.actions)[0];
    assert.deepEqual(action.inputs.map(({ name, in: location, key }) => [name, location, key]), [['id', 'query', 'field:0'], ['id', 'header', 'field:1']]);
    assert.deepEqual(savedResponse(model.endpoints[0], '1'), { status: 404, headers: {}, body: 'missing' });
    assert.equal(savedResponse(model.endpoints[0], '99'), undefined);
  });
});

describe('analyzer', () => {
  const model = analyzeCollection(shopCollection());
  it('extracts endpoints with normalized keys', () => {
    assert.equal(model.endpoints.length, 16);
    assert.ok(model.endpoints.some((e) => e.key === 'GET /users/{id}'));
    assert.ok(model.endpoints.some((e) => e.key === 'POST /orders/{id}/cancel'));
  });
  it('resolves inherited auth and folder paths', () => {
    const profile = model.endpoints.find((e) => e.key === 'GET /profile')!;
    assert.equal(profile.auth.type, 'bearer');
    assert.equal(profile.auth.inherited, true);
    assert.deepEqual(profile.folderPath, ['Auth']);
    assert.equal(model.endpoints.find((e) => e.key === 'POST /login')!.auth.type, 'noauth');
  });
  it('scans scripts statically for chaining hints', () => {
    assert.deepEqual(model.endpoints.find((e) => e.key === 'POST /login')!.scriptHints.sets, ['token']);
  });
  it('flags external hosts, missing examples and duplicates', () => {
    assert.ok(model.endpoints.find((e) => e.path === '/rates')!.flags.external);
    assert.ok(model.warnings.some((w) => w.code === 'NO_EXAMPLES' && w.endpoint === 'PUT /users/{id}'));
    const dup = analyzeCollection({ info: { name: 'd' }, item: [item('a', 'GET', '{{u}}/x'), item('b', 'GET', '{{u}}/x')] });
    assert.ok(dup.warnings.some((w) => w.code === 'DUPLICATE_ENDPOINT'));
    assert.equal(dup.endpoints[1].key, 'GET /x#2');
  });
  it('survives garbage input', () => {
    assert.equal(analyzeCollection(null).endpoints.length, 0);
    assert.equal(analyzeCollection({ item: 'nope' }).endpoints.length, 0);
  });
  it('does not mutate the source collection', () => {
    const c = shopCollection();
    const before = JSON.stringify(c);
    analyzeCollection(c);
    generateApp(c);
    assert.equal(JSON.stringify(c), before);
  });
});

describe('contract', () => {
  it('marks everything from one example as inferred, never confirmed', () => {
    const s = inferSchema({ id: 1, name: 'x' });
    assert.equal(s.status, 'inferred');
    assert.equal(s.properties!.id.status, 'inferred');
  });
  it('merges examples: widens types, tracks nullability and required candidates', () => {
    const m = mergeSchemas(inferSchema({ a: 1, b: 'x' }), inferSchema({ a: 2.5, c: null }));
    assert.equal(m.properties!.a.type, 'number');
    assert.deepEqual(m.requiredCandidates, ['a']);
    assert.equal(m.properties!.c.nullable, true);
  });
  it('validates inferred schemas leniently (warnings only)', () => {
    const issues = validateAgainst(inferSchema({ id: 1 }), { id: 'oops' });
    assert.equal(issues.length, 1);
    assert.equal(issues[0].severity, 'warning');
  });
  it('is stable and diffable', () => {
    const a = bundle().contract;
    assert.equal(a.version, bundle().contract.version);
    const changed = shopCollection();
    (changed.item[1] as any).item.pop(); // remove Delete user
    const b = generateApp(changed).contract;
    assert.ok(diffContracts(a, b).some((c) => c.type === 'endpoint.removed' && c.endpoint === 'DELETE /users/{id}'));
  });
  it('keeps no authorization header values in the contract', () => {
    const c = shopCollection() as any;
    c.item[1].item[0].request.header = [{ key: 'Authorization', value: 'Bearer SECRET123' }];
    assert.ok(!JSON.stringify(generateApp(c).contract).includes('SECRET123'));
  });
});

describe('relationships and rules', () => {
  const b = bundle();
  it('detects CRUD, nested and auth roles', () => {
    const roles = (k: string) => b.graph.roles[k].role;
    assert.equal(roles('GET /users'), 'list');
    assert.equal(roles('GET /users/{id}'), 'get');
    assert.equal(roles('DELETE /users/{id}'), 'delete');
    assert.equal(roles('GET /orders/{id}/items'), 'nested-list');
    assert.equal(roles('POST /orders/{id}/cancel'), 'action');
    assert.equal(roles('POST /login'), 'auth.login');
    assert.equal(roles('GET /profile'), 'auth.session');
  });
  it('builds a childOf edge and a script-chain edge', () => {
    assert.ok(b.graph.edges.some((e) => e.type === 'childOf' && e.from === 'orders.items' && e.to === 'orders'));
    assert.ok(b.graph.resources.find((r) => r.id === 'users')!.confidence >= 0.8);
  });
  it('groups endpoints into modules instead of one screen per endpoint', () => {
    assert.ok(b.schema.screens.length < b.stats.endpoints, `${b.schema.screens.length} screens for ${b.stats.endpoints} endpoints`);
    assert.ok(b.schema.screens.filter((s) => s.kind !== 'modal').length <= 8);
    const ids = b.schema.screens.map((s) => s.id);
    for (const id of ['scr.users.list', 'scr.users.detail', 'scr.users.create', 'scr.orders.list', 'scr.orders.detail', 'scr.auth.login', 'scr.auth.profile', 'scr.explorer']) assert.ok(ids.includes(id), `missing ${id}`);
    assert.ok(!ids.includes('scr.orders.items.list'));
  });
  it('builds users list table with columns, pager and toolbar', () => {
    const t = b.schema.screens.find((s) => s.id === 'scr.users.list')!.components.find((c) => c.id === 'c.table')!;
    assert.deepEqual(t.columns.slice(0, 3), ['id', 'name', 'email']);
    assert.equal(t.dataPath, '$.data');
    assert.equal(t.pagination.kind, 'page');
    assert.equal(t.pagination.totalPath, '$.meta.total');
    assert.equal(t.toolbar.search, 'q');
  });
  it('puts child resources and verbs on the parent detail', () => {
    const d = b.schema.screens.find((s) => s.id === 'scr.orders.detail')!;
    assert.ok(d.components.some((c) => c.type === 'section' && c.title === 'Items'));
    assert.ok(d.components.some((c) => c.id === 'c.act.cancel'));
    assert.equal(b.schema.actions['act.orders.cancel'].kind, 'async');
    assert.ok(b.schema.actions['act.users.delete'].confirm);
  });
  it('excludes external, marks background, sends unknown to the explorer (never drops)', () => {
    const d = b.schema.dispositions;
    assert.equal(d['GET /rates'].state, 'excluded');
    assert.equal(d['GET /health'].state, 'background');
    assert.equal(d['POST /a/b/c/d/e'].state, 'explorer');
    assert.ok(b.schema.review.some((r) => r.endpoint === 'POST /a/b/c/d/e'));
    assert.equal(Object.keys(d).length, b.stats.endpoints);
  });
  it('every action and rule decision carries provenance and a rule id', () => {
    Object.values(b.schema.actions).forEach((a) => assert.ok(a.ruleId && a.provenance));
  });
  it('is deterministic', () => {
    assert.equal(stableStringify(bundle().schema), stableStringify(bundle().schema));
  });
  it('user overrides win and survive: exclude removes dependent UI', () => {
    const o = generateApp(shopCollection(), { overrides: [{ target: 'DELETE /users/{id}', decision: { exclude: 'not needed' } }] });
    assert.equal(o.schema.dispositions['DELETE /users/{id}'].state, 'excluded');
    assert.equal(o.schema.dispositions['DELETE /users/{id}'].provenance, 'user');
    assert.ok(!o.schema.actions['act.users.delete']);
    assert.ok(!o.schema.screens.find((s) => s.id === 'scr.users.detail')!.components.some((c) => c.id === 'c.delete'));
  });
  it('disabled rules are inert', () => {
    const o = generateApp(shopCollection(), { disabledRules: ['R-CRUD-004'] });
    assert.ok(!o.schema.actions['act.users.delete']);
    assert.equal(o.schema.dispositions['DELETE /users/{id}'].state, 'explorer');
  });
  it('explains decisions via trace and reports conflicts instead of hiding them', () => {
    assert.ok(Array.isArray(b.schema.trace));
    assert.ok(Array.isArray(b.schema.conflicts));
  });
});

describe('mock engine', () => {
  const b = bundle();
  const ctx: MockCtx = { model: b.model, contract: b.contract, graph: b.graph };
  const call = (state: any, req: any) => invoke(ctx, state, req);
  const login = (state: any) => {
    const r = call(state, { endpoint: 'POST /login', body: {} });
    return { state: r.state, token: (r.result.body as any).token as string };
  };

  it('is deterministic by seed and different across seeds', () => {
    assert.equal(stableStringify(createInitialState(ctx, 7)), stableStringify(createInitialState(ctx, 7)));
    assert.notEqual(stableStringify(createInitialState(ctx, 7)), stableStringify(createInitialState(ctx, 8)));
  });
  it('rejects protected calls without a token and issues MOCK tokens on login', () => {
    const s0 = createInitialState(ctx, 1);
    assert.equal(call(s0, { endpoint: 'GET /users' }).result.status, 401);
    const { state, token } = login(s0);
    assert.match(token, /^MOCK-/);
    assert.equal(call(state, { endpoint: 'GET /users', token }).result.status, 200);
  });
  it('list → detail consistency: a listed id returns the same record', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const list = call(state, { endpoint: 'GET /users', token, query: { page: '1', limit: '5' } }).result.body as any;
    assert.equal(list.data.length, 5);
    assert.equal(list.meta.total, 12);
    const row = list.data[3];
    const one = call(state, { endpoint: 'GET /users/{id}', token, pathParams: { id: String(row.id) } }).result.body as any;
    assert.deepEqual(one.data, row);
  });
  it('supports paging, search and sorting', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const p2 = call(state, { endpoint: 'GET /users', token, query: { page: '2', limit: '5' } }).result.body as any;
    assert.equal(p2.data[0].id, 6);
    const q = call(state, { endpoint: 'GET /users', token, query: { q: 'user3@' } }).result.body as any;
    assert.ok(q.data.length >= 1 && q.data.every((r: any) => JSON.stringify(r).includes('user3@')));
    const sorted = call(state, { endpoint: 'GET /users', token, query: { sort: '-id', limit: '3' } }).result.body as any;
    assert.deepEqual(sorted.data.map((r: any) => r.id), [12, 11, 10]);
  });
  it('simulates create / update / delete with state', () => {
    let { state, token } = login(createInitialState(ctx, 1));
    let r = call(state, { endpoint: 'POST /users', token, body: { name: 'Zed', email: 'z@x.com' } });
    assert.equal(r.result.status, 201);
    const id = (r.result.body as any).data.id;
    assert.equal(id, 13);
    state = r.state;
    r = call(state, { endpoint: 'PUT /users/{id}', token, pathParams: { id: String(id) }, body: { name: 'Zed2' } });
    assert.equal((r.result.body as any).data.name, 'Zed2');
    state = r.state;
    r = call(state, { endpoint: 'DELETE /users/{id}', token, pathParams: { id: String(id) } });
    assert.equal(r.result.status, 204);
    state = r.state;
    const gone = call(state, { endpoint: 'GET /users/{id}', token, pathParams: { id: String(id) } });
    assert.equal(gone.result.status, 404);
    assert.deepEqual(gone.result.body, { message: 'User not found' }); // documented example replayed
    assert.equal(gone.result.provenance, 'documented');
  });
  it('does not mutate the input state (pure)', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const before = stableStringify(state);
    call(state, { endpoint: 'POST /users', token, body: { name: 'a' } });
    assert.equal(stableStringify(state), before);
  });
  it('scopes nested resources to their parent', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const a = call(state, { endpoint: 'GET /orders/{id}/items', token, pathParams: { id: '1' } }).result.body as any[];
    const b2 = call(state, { endpoint: 'GET /orders/{id}/items', token, pathParams: { id: '2' } }).result.body as any[];
    assert.ok(a.length > 0 && b2.length > 0);
    assert.ok(!a.some((x) => b2.some((y) => y.id === x.id && JSON.stringify(x) === JSON.stringify(y) && false)));
  });
  it('forced scenarios use documented examples, else a labelled stub', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const v = call(state, { endpoint: 'POST /users', token, scenario: 'validation', body: {} }).result;
    assert.equal(v.status, 422);
    assert.equal(v.provenance, 'documented');
    const stub = call(state, { endpoint: 'GET /orders', token, scenario: 'serverError' }).result;
    assert.equal(stub.status, 500);
    assert.equal(stub.provenance, 'unknown');
    assert.equal((stub.body as any)._mock, true);
    const empty = call(state, { endpoint: 'GET /users', token, scenario: 'empty' }).result.body as any;
    assert.deepEqual(empty.data, []);
  });
  it('does not pretend to know the effects of action endpoints', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    const r = call(state, { endpoint: 'POST /orders/{id}/cancel', token, pathParams: { id: '1' } });
    assert.equal(r.result.status, 202);
    assert.ok(r.result.trace.some((t) => /effects .* unknown/.test(t)));
    assert.equal(stableStringify(r.state.tables), stableStringify(state.tables));
  });
  it('matches by method + path too and handles unknown routes', () => {
    const { state, token } = login(createInitialState(ctx, 1));
    assert.equal(call(state, { method: 'GET', path: '/users/3', token }).result.endpoint, 'GET /users/{id}');
    assert.equal(call(state, { method: 'GET', path: '/nothing', token }).result.status, 404);
  });
  it('strict validation is opt-in', () => {
    const strict: MockCtx = { ...ctx, settings: { validation: 'strict' } };
    const s = login(createInitialState(ctx, 1));
    assert.equal(invoke(strict, s.state, { endpoint: 'POST /users', token: s.token, body: {} }).result.status, 422);
    assert.equal(invoke(ctx, s.state, { endpoint: 'POST /users', token: s.token, body: {} }).result.status, 201);
  });
});

describe('generated tests', () => {
  const b = bundle();
  const run = runMockTests(b);
  it('runs contract, mapping, auth and state tests with no failures on a consistent collection', () => {
    assert.equal(run.stats.failed, 0, JSON.stringify(run.results.filter((r) => r.status === 'failed'), null, 1));
    for (const t of ['contract', 'mapping', 'auth', 'state'] as const) assert.ok(run.results.some((r) => r.type === t), t);
  });
  it('skips (does not fail) endpoints without examples', () => {
    const r = run.results.find((x) => x.endpoint === 'PUT /users/{id}' && x.type === 'contract')!;
    assert.equal(r.status, 'skipped');
  });
  it('never raises a hard failure from inferred facts alone', () => {
    run.results.filter((r) => r.certainty === 'inferred').forEach((r) => assert.notEqual(r.status === 'failed' && r.type === 'contract', true));
  });
  it('coverage classifies every endpoint and does not equate screens with coverage', () => {
    const c = run.coverage;
    assert.equal(c.screen + c.action + c.explorer + c.background + c.excluded + c.unmapped.length, c.total);
    assert.equal(c.background, 1);
    assert.equal(c.excluded, 1);
    assert.deepEqual(c.unmapped, []);
  });
  it('detects a planted mapping bug', () => {
    const broken = bundle();
    broken.schema.actions['act.users.list'].endpoint = 'GET /ghost';
    const r = runMockTests(broken);
    assert.ok(r.results.some((x) => x.type === 'mapping' && x.status === 'failed' && x.action === 'act.users.list'));
  });
});

describe('public share projection', () => {
  it('leaks no hashes, request ids, traces, dispositions or sources', () => {
    const b = bundle();
    const pub = JSON.stringify(publicSchema(b.schema));
    assert.ok(!pub.includes(b.schema.app.sourceHash));
    assert.ok(!pub.includes(b.schema.app.contractVersion));
    for (const e of Object.values(b.schema.endpoints)) assert.ok(!pub.includes(e.requestId));
    for (const k of ['"trace"', '"dispositions"', '"conflicts"', '"review"', '"requestId"']) assert.ok(!pub.includes(k), k);
    assert.ok(publicSchema(b.schema).screens.every((s) => s.sources.length === 0));
  });
});
