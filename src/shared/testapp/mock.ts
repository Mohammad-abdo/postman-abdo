import { ApiModel, Contract, Endpoint, RelationshipGraph } from './types';
import { Rng, clone, getPath, isObj, setPath } from './util';
import { findList, idFieldOf, successExample } from './ui-helpers';

/* Stateful mock engine. Pure: no clock, no randomness, no I/O — the state carries the RNG. */

export type Scenario = 'success' | 'empty' | 'validation' | 'unauthorized' | 'notFound' | 'serverError';

export interface MockCtx {
  model: ApiModel;
  contract: Contract;
  graph: RelationshipGraph;
  settings?: { validation?: 'lenient' | 'strict'; rows?: number };
}

export interface MockState {
  rev: number;
  rng: number;
  clock: number;
  seed: number;
  tables: Record<string, any[]>;
  idFields: Record<string, string>;
  tokens: string[];
  /** token of the signed-in mock user in this session (used when a request carries none) */
  current?: string;
}

export interface MockRequest {
  /** Endpoint key (preferred) — or method + path to match. */
  endpoint?: string;
  method?: string;
  path?: string;
  pathParams?: Record<string, string>;
  query?: Record<string, string>;
  body?: any;
  token?: string;
  scenario?: Scenario;
}

export interface MockResult {
  status: number;
  headers: Record<string, string>;
  body: unknown;
  trace: string[];
  endpoint?: string;
  role?: string;
  /** documented = replayed from a saved example, inferred = derived by the engine, unknown = generic stub */
  provenance: 'documented' | 'inferred' | 'unknown';
}

const BASE_TIME = Date.UTC(2024, 5, 1, 9, 0, 0);
const iso = (minutes: number) => new Date(BASE_TIME + minutes * 60_000).toISOString();
const SEARCH_KEYS = /^(q|search|query|keyword|term)$/i;
const SORT_KEYS = /^(sort|sortby|sort_by|orderby|order_by)$/i;
const DIR_KEYS = /^(order|direction|dir)$/i;

/* ------------------------------ data generation ------------------------------ */

function genValue(v: unknown, rng: Rng, key: string, i: number): unknown {
  if (typeof v === 'string') {
    if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return `user${i + 1}@example.test`;
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(v)) return `${rng.hex(8)}-${rng.hex(4)}-4${rng.hex(3)}-a${rng.hex(3)}-${rng.hex(12)}`;
    if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return iso(rng.int(0, 60 * 24 * 90));
    if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return iso(rng.int(0, 60 * 24 * 90)).slice(0, 10);
    if (/^https?:\/\//i.test(v)) return `https://example.test/${key || 'item'}/${i + 1}`;
    if (/(status|type|role|state|category|kind|currency|country|lang)/i.test(key)) return v;
    return v ? `${v} ${i + 1}` : v;
  }
  if (typeof v === 'number') return /id$/i.test(key) ? v : Number.isInteger(v) ? v + rng.int(0, 9) : Number((v + rng.next()).toFixed(2));
  if (typeof v === 'boolean') return rng.next() < 0.5 ? v : !v;
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => genValue(x, rng, key, i));
  if (isObj(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, genValue(x, rng, k, i)]));
  return v;
}

/** Finds the record object inside a single-item response (`{data:{…}}`, `{user:{…}}` or the object itself). */
function recordPath(body: unknown): string {
  if (!isObj(body)) return '$';
  const objs = Object.entries(body).filter(([, v]) => isObj(v));
  const wrapper = objs.find(([k]) => /^(data|result|item|payload|record|entity)$/i.test(k)) || (objs.length === 1 && Object.keys(body).length <= 3 ? objs[0] : undefined);
  return wrapper ? `$.${wrapper[0]}` : '$';
}

const unwrapRecord = (body: unknown) => {
  const p = recordPath(body);
  const v = getPath(body, p);
  return isObj(v) ? v : undefined;
};

function wrapRecord(example: unknown, row: Record<string, any>): unknown {
  if (!isObj(example)) return row;
  const p = recordPath(example);
  const target = p === '$' ? example : getPath(example, p);
  const merged = Object.fromEntries(Object.entries(isObj(target) ? target : row).map(([k, v]) => [k, k in row ? row[k] : v]));
  return p === '$' ? merged : setPath(clone(example), p, merged);
}

const publicRow = ({ __parent, ...row }: Record<string, any>) => row;

/* ------------------------------ state ------------------------------ */

export function createInitialState(ctx: MockCtx, seed = 1): MockState {
  const rng = new Rng(seed * 2654435761);
  const rows = ctx.settings?.rows ?? 12;
  const state: MockState = { rev: 0, rng: rng.state, clock: 0, seed, tables: {}, idFields: {}, tokens: [] };
  const byKey = new Map(ctx.model.endpoints.map((e) => [e.key, e]));
  const resources = [...ctx.graph.resources].sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0));

  for (const r of resources) {
    const ep = (role: string) => r.endpoints.filter((x) => x.role === role).map((x) => byKey.get(x.key) as Endpoint);
    const listEp = ep('list')[0] || ep('nested-list')[0];
    const getEp = ep('get')[0] || ep('nested-get')[0];
    let sample: Record<string, any> | undefined = listEp ? findList(successExample(listEp)?.body)?.sample : undefined;
    if (!sample && getEp) sample = unwrapRecord(successExample(getEp)?.body);
    state.tables[r.id] = [];
    if (!sample) continue;
    const idField = idFieldOf(sample);
    state.idFields[r.id] = idField;
    const parentRows = r.parent ? state.tables[r.parent] || [] : [];
    const parentId = state.idFields[r.parent || ''];
    for (let i = 0; i < rows; i++) {
      const row: Record<string, any> = i === 0 ? clone(sample) : (genValue(sample, rng, '', i) as Record<string, any>);
      if (i > 0 || row[idField] === undefined) {
        const base = sample[idField];
        row[idField] = typeof base === 'number' || base === undefined ? i + 1 : typeof base === 'string' && /^[0-9a-f]{8}-/i.test(base) ? row[idField] : `${base}-${i + 1}`;
      }
      if (r.parent && parentRows.length) row.__parent = parentRows[i % parentRows.length][parentId];
      state.tables[r.id].push(row);
    }
  }
  state.rng = rng.state;
  return state;
}

/* ------------------------------ routing ------------------------------ */

function matcher(e: Endpoint) {
  const names: string[] = [];
  const re = new RegExp('^' + e.path.split('/').map((s) => (/^\{.+\}$/.test(s) ? (names.push(s.slice(1, -1)), '([^/]+)') : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))).join('/') + '/?$', 'i');
  return { e, re, names, literals: e.path.split('/').filter((s) => s && !/^\{/.test(s)).length };
}

export function findEndpoint(ctx: MockCtx, req: MockRequest): { e: Endpoint; params: Record<string, string> } | null {
  if (req.endpoint) {
    const e = ctx.model.endpoints.find((x) => x.key === req.endpoint);
    return e ? { e, params: req.pathParams || {} } : null;
  }
  const path = '/' + String(req.path || '').replace(/^[a-z]+:\/\/[^/]+/i, '').split('?')[0].replace(/^\/+/, '');
  let best: { e: Endpoint; params: Record<string, string>; literals: number } | null = null;
  for (const m of ctx.model.endpoints.map(matcher)) {
    if (m.e.method !== String(req.method || 'GET').toUpperCase()) continue;
    const hit = m.re.exec(path);
    if (!hit) continue;
    if (!best || m.literals > best.literals) best = { e: m.e, params: Object.fromEntries(m.names.map((n, i) => [n, decodeURIComponent(hit[i + 1])])), literals: m.literals };
  }
  return best ? { e: best.e, params: { ...best.params, ...(req.pathParams || {}) } } : null;
}

/* ------------------------------ responses ------------------------------ */

const SCENARIO_CODES: Record<Exclude<Scenario, 'success' | 'empty'>, { codes: number[]; fallback: number; message: string }> = {
  validation: { codes: [422, 400], fallback: 422, message: 'Validation failed (mock scenario)' },
  unauthorized: { codes: [401, 403], fallback: 401, message: 'Unauthorized (mock scenario)' },
  notFound: { codes: [404], fallback: 404, message: 'Not found (mock scenario)' },
  serverError: { codes: [500, 502, 503], fallback: 500, message: 'Server error (mock scenario)' },
};

function errorResponse(e: Endpoint, kind: Exclude<Scenario, 'success' | 'empty'>, extra?: string): MockResult {
  const def = SCENARIO_CODES[kind];
  const ex = e.examples.find((x) => def.codes.includes(x.code));
  if (ex) return { status: ex.code, headers: jsonHeaders(ex.headers), body: ex.body !== undefined ? clone(ex.body) : ex.raw, trace: [`replayed documented ${ex.code} example "${ex.name}"`], endpoint: e.key, provenance: 'documented' };
  return { status: def.fallback, headers: jsonHeaders(), body: { _mock: true, error: extra || def.message, note: 'No saved example for this status; generic stub, not the real backend format.' }, trace: [`no ${def.codes[0]} example saved → generic stub`], endpoint: e.key, provenance: 'unknown' };
}

const jsonHeaders = (extra: Record<string, string> = {}) => {
  const h: Record<string, string> = {};
  Object.entries(extra).forEach(([k, v]) => !/^(content-length|transfer-encoding|connection|set-cookie|authorization)$/i.test(k) && (h[k] = v));
  if (!Object.keys(h).some((k) => k.toLowerCase() === 'content-type')) h['Content-Type'] = 'application/json';
  h['x-mock'] = 'true';
  return h;
};

function updateMeta(root: any, listPath: string, meta: { page?: number; size?: number; total: number }) {
  const parent = listPath.includes('.') ? getPath(root, listPath.slice(0, listPath.lastIndexOf('.'))) : root;
  const holders = [parent, root, ...(isObj(root) ? Object.values(root).filter(isObj) : [])];
  holders.forEach((o) => {
    if (!isObj(o)) return;
    Object.keys(o).forEach((k) => {
      if (/^(total|totalcount|total_count|count|totalitems|total_items|totalelements|totalrecords)$/i.test(k) && typeof o[k] === 'number') o[k] = meta.total;
      if (/^(page|currentpage|current_page|pagenumber|page_number)$/i.test(k) && meta.page && typeof o[k] === 'number') o[k] = meta.page;
      if (/^(limit|per_page|perpage|pagesize|page_size|size)$/i.test(k) && meta.size && typeof o[k] === 'number') o[k] = meta.size;
      if (/^(totalpages|total_pages|pages)$/i.test(k) && meta.size && typeof o[k] === 'number') o[k] = Math.max(1, Math.ceil(meta.total / meta.size));
    });
  });
}

function compare(a: unknown, b: unknown) {
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a ?? '').localeCompare(String(b ?? ''), undefined, { numeric: true });
}

function listResponse(e: Endpoint, rows: Record<string, any>[], query: Record<string, string>, trace: string[], scenario?: Scenario): MockResult {
  let out = rows.map(publicRow);
  if (scenario === 'empty') out = [];
  // search / filters
  for (const [k, v] of Object.entries(query)) {
    if (v === '' || v == null) continue;
    if (SEARCH_KEYS.test(k)) {
      const needle = String(v).toLowerCase();
      out = out.filter((r) => Object.values(r).some((x) => typeof x === 'string' && x.toLowerCase().includes(needle)));
      trace.push(`search "${v}" → ${out.length} rows`);
    } else if (SORT_KEYS.test(k) || DIR_KEYS.test(k) || /^(page|pagenumber|page_number|offset|skip|cursor|after|before|limit|per_page|perpage|pagesize|page_size|size|take)$/i.test(k)) continue;
    else if (out.some((r) => k in r)) {
      out = out.filter((r) => String(r[k]) === String(v));
      trace.push(`filter ${k}=${v} → ${out.length} rows`);
    }
  }
  // sort
  const sortKey = Object.keys(query).find((k) => SORT_KEYS.test(k));
  if (sortKey && query[sortKey]) {
    let field = query[sortKey];
    const desc = /^-/.test(field) || /:desc$/i.test(field) || Object.entries(query).some(([k, v]) => DIR_KEYS.test(k) && /^desc/i.test(String(v)));
    field = field.replace(/^[-+]/, '').replace(/:(asc|desc)$/i, '');
    if (out.some((r) => field in r)) {
      out = [...out].sort((a, b) => (desc ? -1 : 1) * compare(a[field], b[field]));
      trace.push(`sorted by ${field} ${desc ? 'desc' : 'asc'}`);
    }
  }
  const total = out.length;
  // paging
  const q = (re: RegExp) => Object.entries(query).find(([k]) => re.test(k))?.[1];
  const sizeRaw = q(/^(limit|per_page|perpage|pagesize|page_size|size|take)$/i);
  const pageRaw = q(/^(page|pagenumber|page_number)$/i);
  const offsetRaw = q(/^(offset|skip)$/i);
  const cursorRaw = q(/^(cursor|after)$/i);
  const size = Math.min(Math.max(Number(sizeRaw) || 0, 0), 200) || (sizeRaw !== undefined || pageRaw !== undefined || offsetRaw !== undefined || cursorRaw !== undefined ? 10 : 0);
  let page = 1;
  let nextCursor: string | null = null;
  if (size) {
    let start = 0;
    if (cursorRaw) start = Number(Buffer.from(cursorRaw, 'base64').toString()) || 0;
    else if (offsetRaw !== undefined) start = Math.max(Number(offsetRaw) || 0, 0);
    else {
      page = Math.max(Number(pageRaw) || 1, 1);
      start = (page - 1) * size;
    }
    out = out.slice(start, start + size);
    if (start + size < total) nextCursor = Buffer.from(String(start + size)).toString('base64');
    trace.push(`page ${page} size ${size} (${total} total)`);
  }

  const ex = successExample(e);
  const shape = findList(ex?.body);
  if (ex && ex.body !== undefined && shape) {
    const body = clone(ex.body);
    const target = shape.path === '$' ? out : (setPath(body, shape.path, out), body);
    if (shape.path !== '$') updateMeta(body, shape.path, { page: size ? page : undefined, size: size || undefined, total });
    if (isObj(target) && nextCursor) Object.keys(target).forEach((k) => /(next|nextcursor|next_cursor|after)$/i.test(k) && (target[k] = nextCursor));
    return { status: ex.code, headers: jsonHeaders(ex.headers), body: target, trace, endpoint: e.key, provenance: 'inferred' };
  }
  return { status: 200, headers: jsonHeaders(), body: out, trace: [...trace, 'no saved list example → plain array (generic shape)'], endpoint: e.key, provenance: 'unknown' };
}

/* ------------------------------ invoke ------------------------------ */

export function invoke(ctx: MockCtx, stateIn: MockState, req: MockRequest): { result: MockResult; state: MockState } {
  const state: MockState = clone(stateIn);
  const rng = new Rng(state.rng);
  const trace: string[] = [];
  const done = (result: MockResult) => {
    state.rng = rng.state;
    state.rev++;
    state.clock++;
    result.trace = [...trace, ...result.trace];
    return { result, state };
  };

  const hit = findEndpoint(ctx, req);
  if (!hit) return done({ status: 404, headers: jsonHeaders(), body: { _mock: true, error: 'No endpoint in the contract matches this request' }, trace: ['no endpoint matched'], provenance: 'unknown' });
  const { e, params } = hit;
  const info = ctx.graph.roles[e.key] || { role: 'unknown', resource: null };
  const role = info.role;
  const res = info.resource;
  trace.push(`endpoint ${e.key} · role ${role}${res ? ` · resource ${res}` : ''}`);

  const base = { endpoint: e.key, role } as const;
  const fin = (r: MockResult) => done({ ...r, ...base });

  // auth
  const needsAuth = e.auth.type !== 'noauth' && role !== 'auth.login' && !!ctx.graph.authLogin;
  const token = req.token ?? state.current;
  if (needsAuth && !(token && state.tokens.includes(token))) {
    trace.push('requires auth; no valid mock token');
    return fin(errorResponse(e, 'unauthorized'));
  }
  if (req.scenario && req.scenario !== 'success' && req.scenario !== 'empty') {
    trace.push(`forced scenario ${req.scenario}`);
    return fin(errorResponse(e, req.scenario));
  }

  const idName = e.pathParams[e.pathParams.length - 1]?.name;
  const parentName = e.pathParams.length > 1 || role.startsWith('nested') ? e.pathParams[0]?.name : undefined;
  const success = successExample(e);
  const okCode = (fallback: number) => success?.code || fallback;
  // Write endpoints without their own example borrow the record shape of the resource's GET example (inferred).
  const siblingGet = res ? ctx.graph.resources.find((r) => r.id === res)?.endpoints.find((x) => x.role === 'get' || x.role === 'nested-get') : undefined;
  const recordExample = success?.body !== undefined ? success.body : siblingGet ? successExample(ctx.model.endpoints.find((x) => x.key === siblingGet.key) as Endpoint)?.body : undefined;
  const table = res ? state.tables[res] || (state.tables[res] = []) : [];
  const idField = (res && state.idFields[res]) || 'id';
  const idParam = idName ? params[idName] : undefined;
  const parentId = role.startsWith('nested') && parentName ? params[parentName] : undefined;
  const scoped = () => (parentId !== undefined ? table.filter((r) => String(r.__parent) === String(parentId)) : table);
  const find = () => scoped().find((r) => String(r[idField]) === String(idParam));
  const missing = () => {
    trace.push(`no ${res} with ${idField}=${idParam}`);
    return fin(errorResponse(e, 'notFound'));
  };

  // strict validation (inferred expectations are only enforced when the user opted in)
  if ((role === 'create' || role === 'nested-create' || role === 'update' || role === 'patch' || role === 'nested-update') && isObj(e.body.example)) {
    const missingKeys = Object.keys(e.body.example).filter((k) => !isObj(req.body) || !(k in req.body));
    if (missingKeys.length) {
      if (ctx.settings?.validation === 'strict' && role !== 'patch') return fin(errorResponse(e, 'validation', `Missing fields: ${missingKeys.join(', ')}`));
      trace.push(`warning: body lacks ${missingKeys.join(', ')} (lenient validation)`);
    }
  }

  const body = isObj(req.body) ? req.body : {};
  switch (role) {
    case 'list':
    case 'nested-list':
      return fin(listResponse(e, scoped(), req.query || {}, [], req.scenario));
    case 'search': {
      const r = res ? state.tables[res] || [] : [];
      return fin(listResponse(e, r, req.query || {}, ['search endpoint'], req.scenario));
    }
    case 'get':
    case 'nested-get': {
      const row = find();
      if (!row) return missing();
      return fin({ status: okCode(200), headers: jsonHeaders(success?.headers), body: wrapRecord(recordExample, publicRow(row)), trace: ['read row'], provenance: success ? 'inferred' : 'unknown' });
    }
    case 'create':
    case 'nested-create': {
      const sample = table[0] ? publicRow(table[0]) : {};
      const fill = Object.fromEntries(Object.entries(sample).filter(([k]) => !(k in body) && k !== idField).map(([k, v]) => [k, /(at|date|time)$/i.test(k) && typeof v === 'string' ? iso(state.clock + 1) : genValue(v, rng, k, table.length)]));
      const next = table.reduce((m, r) => (typeof r[idField] === 'number' ? Math.max(m, r[idField]) : m), 0) + 1;
      const row: Record<string, any> = { ...fill, ...clone(body) };
      if (row[idField] === undefined) row[idField] = typeof sample[idField] === 'string' ? `mock-${rng.hex(8)}` : next;
      if (parentId !== undefined) {
        const pr = ctx.graph.resources.find((x) => x.id === res)?.parent;
        const parentRow = pr ? (state.tables[pr] || []).find((r) => String(r[state.idFields[pr] || 'id']) === String(parentId)) : undefined;
        row.__parent = parentRow ? parentRow[state.idFields[pr as string] || 'id'] : parentId;
      }
      state.tables[res as string] = [...table, row];
      state.idFields[res as string] = idField;
      trace.push(`inserted ${idField}=${row[idField]}`);
      return fin({ status: okCode(201), headers: jsonHeaders(success?.headers), body: wrapRecord(recordExample, publicRow(row)), trace: [], provenance: recordExample !== undefined ? 'inferred' : 'unknown' });
    }
    case 'update':
    case 'patch':
    case 'nested-update': {
      const row = find();
      if (!row) return missing();
      Object.assign(row, clone(body), { [idField]: row[idField] });
      trace.push(`updated ${idField}=${row[idField]}`);
      return fin({ status: okCode(200), headers: jsonHeaders(success?.headers), body: wrapRecord(recordExample, publicRow(row)), trace: [], provenance: recordExample !== undefined ? 'inferred' : 'unknown' });
    }
    case 'delete':
    case 'nested-delete': {
      const row = find();
      if (!row) return missing();
      state.tables[res as string] = table.filter((r) => r !== row);
      trace.push(`deleted ${idField}=${row[idField]}`);
      const noBody = !success || success.body === undefined || success.raw === '';
      return fin({ status: okCode(204), headers: jsonHeaders(success?.headers), body: noBody ? '' : clone(success!.body), trace: [], provenance: success ? 'documented' : 'unknown' });
    }
    case 'auth.login': {
      const token = `MOCK-${rng.hex(24)}`;
      state.tokens.push(token);
      state.current = token;
      let out: unknown = { token };
      let replaced = false;
      if (success?.body !== undefined) {
        out = clone(success.body);
        const walk = (o: any) => {
          if (Array.isArray(o)) return o.forEach(walk);
          if (!isObj(o)) return;
          Object.keys(o).forEach((k) => {
            if (typeof o[k] === 'string' && /token/i.test(k)) {
              o[k] = /refresh/i.test(k) ? `MOCK-R-${rng.hex(24)}` : token;
              replaced = true;
            } else walk(o[k]);
          });
        };
        walk(out);
        if (!replaced) out = { ...(isObj(out) ? out : {}), token };
      }
      trace.push('issued synthetic MOCK token (never valid outside this session)');
      return fin({ status: okCode(200), headers: jsonHeaders(success?.headers), body: out, trace: [], provenance: success ? 'inferred' : 'unknown' });
    }
    case 'auth.logout': {
      state.tokens = state.tokens.filter((t) => t !== token);
      if (state.current === token) state.current = undefined;
      trace.push('token invalidated');
      return fin({ status: okCode(204), headers: jsonHeaders(success?.headers), body: success?.body !== undefined ? clone(success.body) : '', trace: [], provenance: success ? 'documented' : 'unknown' });
    }
    default: {
      // session / action / refresh / unknown: replay the saved example; the real side effects are not known
      if (success) {
        trace.push('replayed saved example; effects of this endpoint on state are unknown, so none are simulated');
        return fin({ status: success.code, headers: jsonHeaders(success.headers), body: success.body !== undefined ? clone(success.body) : success.raw, trace: [], provenance: 'documented' });
      }
      return fin({ status: 200, headers: jsonHeaders(), body: { _mock: true, note: 'No saved example for this endpoint; generic stub, not the real backend format.' }, trace: ['no example'], provenance: 'unknown' });
    }
  }
}
