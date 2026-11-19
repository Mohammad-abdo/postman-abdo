import { ApiModel, Edge, Endpoint, RelationshipGraph, Resource, Role } from './types';

const isParam = (s: string) => /^\{.+\}$/.test(s);
const LOGIN = /^(login|signin|sign-in|log-in|authenticate|auth|token|oauth|session|sessions)$/i;
const LOGOUT = /^(logout|signout|sign-out|log-out)$/i;
const REFRESH = /^(refresh|refresh-token|refreshtoken)$/i;
const SESSION = /^(profile|me|whoami|current-user|account)$/i;
export const ACTION_VERBS = /^(cancel|approve|reject|confirm|activate|deactivate|archive|restore|publish|unpublish|submit|send|pay|refund|close|open|reset|verify|retry|start|stop|complete|assign|duplicate|clone|export|import|download|upload)$/i;
const SEARCH = /^(search|find|query|filter)$/i;
export const BACKGROUND = /^(health|healthz|ping|metrics|status|ready|readyz|livez|version|heartbeat|webhook|webhooks|callback)$/i;

/** Classifies an endpoint by method + path shape. Deterministic; explained via `evidence`. */
export function classify(e: Endpoint): { role: Role; resource: string | null; verb?: string } {
  const s = e.segments;
  const lits = s.filter((x) => !isParam(x));
  const last = s[s.length - 1] || '';
  const m = e.method;
  if (!s.length) return { role: 'unknown', resource: null };

  // authentication
  if (m === 'POST' && lits.length === 1 && s.length === 1 && LOGIN.test(last)) return { role: 'auth.login', resource: null };
  if (m === 'POST' && lits.length <= 2 && s.length <= 2 && LOGIN.test(last) && s.length === 2 && /^(auth|oauth|users?|account|sessions?)$/i.test(s[0])) return { role: 'auth.login', resource: null };
  if (LOGOUT.test(last)) return { role: 'auth.logout', resource: null };
  if (REFRESH.test(last)) return { role: 'auth.refresh', resource: null };
  if (m === 'GET' && SESSION.test(last) && !isParam(last) && s.length <= 2) return { role: 'auth.session', resource: null };

  // shape: [lit]
  if (s.length === 1 && !isParam(s[0])) {
    if (m === 'GET') return { role: 'list', resource: s[0] };
    if (m === 'POST') return { role: 'create', resource: s[0] };
    return { role: 'unknown', resource: s[0] };
  }
  // [lit, {p}]
  if (s.length === 2 && !isParam(s[0]) && isParam(s[1])) {
    const r = s[0];
    if (m === 'GET') return { role: 'get', resource: r };
    if (m === 'PUT') return { role: 'update', resource: r };
    if (m === 'PATCH') return { role: 'patch', resource: r };
    if (m === 'DELETE') return { role: 'delete', resource: r };
    return { role: 'unknown', resource: r };
  }
  // [lit, lit]  e.g. /users/search, /orders/export
  if (s.length === 2 && !isParam(s[0]) && !isParam(s[1])) {
    if (SEARCH.test(s[1]) && m === 'GET') return { role: 'search', resource: s[0] };
    if (ACTION_VERBS.test(s[1])) return { role: 'action', resource: s[0], verb: s[1] };
  }
  // [lit, {p}, lit]  e.g. /orders/{id}/items, /orders/{id}/cancel
  if (s.length === 3 && !isParam(s[0]) && isParam(s[1]) && !isParam(s[2])) {
    if (ACTION_VERBS.test(s[2]) && m !== 'GET') return { role: 'action', resource: s[0], verb: s[2] };
    if (m === 'GET') return { role: 'nested-list', resource: `${s[0]}.${s[2]}` };
    if (m === 'POST') return { role: 'nested-create', resource: `${s[0]}.${s[2]}` };
  }
  // [lit, {p}, lit, {q}]
  if (s.length === 4 && !isParam(s[0]) && isParam(s[1]) && !isParam(s[2]) && isParam(s[3])) {
    const r = `${s[0]}.${s[2]}`;
    if (m === 'GET') return { role: 'nested-get', resource: r };
    if (m === 'PUT' || m === 'PATCH') return { role: 'nested-update', resource: r };
    if (m === 'DELETE') return { role: 'nested-delete', resource: r };
  }
  return { role: 'unknown', resource: lits[0] || null };
}

export function buildGraph(model: ApiModel): RelationshipGraph {
  const roles: RelationshipGraph['roles'] = {};
  const byResource = new Map<string, Resource>();
  const unresolved: RelationshipGraph['unresolved'] = [];
  const edges: Edge[] = [];

  for (const e of model.endpoints) {
    const c = classify(e);
    roles[e.key] = c;
    if (c.role === 'unknown') unresolved.push({ endpoint: e.key, reason: 'No relationship rule recognised this path/method shape' });
    if (!c.resource || e.flags.external || BACKGROUND.test(e.segments[e.segments.length - 1] || '')) continue;
    let r = byResource.get(c.resource);
    if (!r) {
      const parts = c.resource.split('.');
      r = { id: c.resource, name: parts[parts.length - 1], parent: parts.length > 1 ? parts.slice(0, -1).join('.') : undefined, endpoints: [], confidence: 0, provenance: 'inferred', evidence: [] };
      byResource.set(c.resource, r);
    }
    r.endpoints.push({ key: e.key, role: c.role });
  }

  const folderMatches = (r: Resource) => model.endpoints.some((e) => roles[e.key].resource === r.id && e.folderPath.some((f) => f.toLowerCase().replace(/[^a-z]/g, '') === r.name.toLowerCase().replace(/[^a-z]/g, '')));
  for (const r of byResource.values()) {
    const set = new Set(r.endpoints.map((x) => x.role.replace('nested-', '')));
    let score = 0.4 + 0.1 * Math.min(set.size, 4);
    if (set.has('list') && set.has('get')) score += 0.2;
    if (folderMatches(r)) score += 0.1;
    r.confidence = Math.min(0.95, Number(score.toFixed(2)));
    r.evidence = [`roles: ${[...set].join(', ')}`, ...(folderMatches(r) ? ['a folder carries the resource name'] : [])];
    if (r.parent) {
      if (!byResource.has(r.parent)) byResource.set(r.parent, { id: r.parent, name: r.parent.split('.').pop() as string, endpoints: [], confidence: 0.4, provenance: 'inferred', evidence: ['implied by a nested path; no direct endpoints'] });
      edges.push({ from: r.id, to: r.parent, type: 'childOf', confidence: 0.9, provenance: 'inferred', evidence: [`path nests /${r.parent.split('.').pop()}/{id}/${r.name}`] });
    }
  }

  // script chains: endpoint sets a variable that another endpoint reads
  const setters = new Map<string, Endpoint>();
  model.endpoints.forEach((e) => e.scriptHints.sets.forEach((v) => !setters.has(v) && setters.set(v, e)));
  const authLoginKey = model.endpoints.find((e) => roles[e.key].role === 'auth.login')?.key || null;
  for (const e of model.endpoints) {
    for (const v of e.scriptHints.reads) {
      const src = setters.get(v);
      if (src && src.key !== e.key) edges.push({ from: src.key, to: e.key, type: 'producesFor', confidence: 0.9, provenance: 'inferred', evidence: [`${src.key} sets {{${v}}} in a script; ${e.key} reads it`] });
    }
    if (e.auth.type !== 'noauth' && authLoginKey && e.key !== authLoginKey && roles[e.key].role !== 'auth.login') {
      edges.push({ from: authLoginKey, to: e.key, type: 'requiresAuth', confidence: 0.6, provenance: 'inferred', evidence: [`auth type "${e.auth.type}" and a login endpoint exists`] });
    }
  }

  // cycles among producesFor edges (DFS)
  const adj = new Map<string, string[]>();
  edges.filter((x) => x.type === 'producesFor').forEach((x) => adj.set(x.from, [...(adj.get(x.from) || []), x.to]));
  const cycles: string[][] = [];
  const state = new Map<string, number>();
  const stack: string[] = [];
  const dfs = (n: string) => {
    state.set(n, 1);
    stack.push(n);
    for (const m of adj.get(n) || []) {
      if (state.get(m) === 1) cycles.push([...stack.slice(stack.indexOf(m)), m]);
      else if (!state.get(m)) dfs(m);
    }
    stack.pop();
    state.set(n, 2);
  };
  [...adj.keys()].forEach((n) => !state.get(n) && dfs(n));

  return { resources: [...byResource.values()], edges, roles, authLogin: authLoginKey, cycles, unresolved };
}
