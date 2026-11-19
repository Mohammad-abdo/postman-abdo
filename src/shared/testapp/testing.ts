import { validateAgainst } from './contract';
import { MockCtx, MockRequest, MockState, createInitialState, invoke } from './mock';
import { Bundle, Endpoint } from './types';
import { clone, isObj } from './util';

export interface TestResult {
  id: string;
  name: string;
  type: 'contract' | 'mapping' | 'auth' | 'state';
  endpoint?: string;
  screen?: string;
  action?: string;
  mode: 'mock';
  status: 'passed' | 'failed' | 'warning' | 'skipped';
  expected: string;
  actual: string;
  /** failed is only possible on documented facts; inferred mismatches are warnings */
  certainty: 'verified' | 'inferred';
  error?: string;
  evidence?: { request?: unknown; response?: unknown };
}

export interface Coverage {
  total: number;
  screen: number;
  action: number;
  explorer: number;
  background: number;
  excluded: number;
  unmapped: string[];
  untested: string[];
}

const ROLE_ORDER = ['auth.login', 'auth.session', 'list', 'nested-list', 'search', 'get', 'nested-get', 'action', 'auth.refresh', 'create', 'nested-create', 'update', 'patch', 'nested-update', 'unknown', 'delete', 'nested-delete', 'auth.logout'];
const trunc = (v: unknown) => {
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s && s.length > 2000 ? s.slice(0, 2000) + '…' : v;
};

export function runMockTests(bundle: Bundle, opts: { seed?: number } = {}) {
  const ctx: MockCtx = { model: bundle.model, contract: bundle.contract, graph: bundle.graph };
  const results: TestResult[] = [];
  let state: MockState = createInitialState(ctx, opts.seed ?? bundle.schema.app.seed);
  let token: string | undefined;
  const byKey = new Map(bundle.model.endpoints.map((e) => [e.key, e]));
  const call = (req: MockRequest) => {
    const out = invoke(ctx, state, { token, ...req });
    state = out.state;
    return out.result;
  };
  const add = (r: Omit<TestResult, 'id' | 'mode'>) => results.push({ id: `T${String(results.length + 1).padStart(3, '0')}`, mode: 'mock', ...r });

  const login = bundle.graph.authLogin ? byKey.get(bundle.graph.authLogin) : undefined;
  const doLogin = () => {
    if (!login) return;
    const res = call({ endpoint: login.key, body: login.body.example });
    token = JSON.stringify(res.body).match(/MOCK-[0-9a-f]+/)?.[0];
  };
  doLogin();
  const requestFor = (e: Endpoint): MockRequest => {
    const info = bundle.graph.roles[e.key];
    const pathParams: Record<string, string> = {};
    const row = info.resource ? state.tables[info.resource]?.[0] : undefined;
    const parentRes = bundle.graph.resources.find((r) => r.id === info.resource)?.parent;
    const parentRow = parentRes ? state.tables[parentRes]?.[0] : undefined;
    e.pathParams.forEach((p, i) => {
      const last = i === e.pathParams.length - 1;
      const src = last && !info.role.startsWith('nested') ? row : info.role.startsWith('nested') && !last ? parentRow : row;
      const idf = info.resource ? state.idFields[last ? info.resource : parentRes || info.resource] : undefined;
      pathParams[p.name] = String(src && idf ? src[idf] : p.example || '1');
    });
    const query: Record<string, string> = {};
    e.query.forEach((q) => q.example !== undefined && (query[q.name] = q.example));
    return { endpoint: e.key, pathParams, query, body: clone(e.body.example) };
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
    const issues = ex.body !== undefined ? validateAgainst(bundle.contract.endpoints[e.key].responses[String(ex.code)]?.schema, res.body) : [];
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
    if (noSources.length) add({ name: `Screen ${sc.id} sources exist`, type: 'mapping', screen: sc.id, status: 'failed', expected: 'sources exist', actual: noSources.join(', '), certainty: 'verified' });
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
    const role = (n: string) => r.endpoints.find((x) => x.role === n);
    const create = role('create');
    const get = role('get');
    if (!create || !get) continue;
    const ce = byKey.get(create.key) as Endpoint;
    const ge = byKey.get(get.key) as Endpoint;
    const created = call({ endpoint: ce.key, body: clone(ce.body.example) ?? {} });
    const body = created.body;
    const rec = isObj(body) ? (Object.values(body).find(isObj) as any) || body : undefined;
    const idf = state.idFields[r.id] || 'id';
    const id = rec?.[idf] ?? state.tables[r.id]?.[state.tables[r.id].length - 1]?.[idf];
    const read = call({ endpoint: ge.key, pathParams: { [ge.pathParams[ge.pathParams.length - 1]?.name || 'id']: String(id) } });
    add({ name: `${r.name}: created record can be read back`, type: 'state', endpoint: ge.key, status: read.status < 300 ? 'passed' : 'failed', expected: '2xx on GET after POST', actual: String(read.status), certainty: 'inferred', evidence: { request: trunc({ id }), response: trunc(read.body) } });
    const del = role('delete');
    if (del) {
      const de = byKey.get(del.key) as Endpoint;
      call({ endpoint: de.key, pathParams: { [de.pathParams[de.pathParams.length - 1]?.name || 'id']: String(id) } });
      const gone = call({ endpoint: ge.key, pathParams: { [ge.pathParams[ge.pathParams.length - 1]?.name || 'id']: String(id) } });
      add({ name: `${r.name}: deleted record returns not found`, type: 'state', endpoint: ge.key, status: gone.status === 404 ? 'passed' : 'failed', expected: '404 after DELETE', actual: String(gone.status), certainty: 'inferred' });
    }
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
export function coverageOf(bundle: Bundle, results: TestResult[] = []): Coverage {
  const s = bundle.schema;
  const kind = (k: string): string => {
    const d = s.dispositions[k];
    if (!d) return 'unmapped';
    if (d.state !== 'mapped') return d.state;
    return s.screens.some((sc) => sc.sources.includes(k)) ? 'screen' : 'action';
  };
  const c: Coverage = { total: bundle.model.endpoints.length, screen: 0, action: 0, explorer: 0, background: 0, excluded: 0, unmapped: [], untested: [] };
  bundle.model.endpoints.forEach((e) => {
    const k = kind(e.key);
    if (k === 'unmapped') c.unmapped.push(e.key);
    else (c as any)[k]++;
    if (!['excluded', 'background'].includes(k) && !results.some((r) => r.type === 'contract' && r.endpoint === e.key && r.status !== 'skipped')) c.untested.push(e.key);
  });
  return c;
}
