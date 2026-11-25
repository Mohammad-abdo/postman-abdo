/* Collection → OpenAPI 3.0.3. Pure: built only from what is saved (requests and their examples), nothing is invented. */

type KV = { key?: string; value?: string; enabled?: boolean; description?: string };
interface Req {
  name: string;
  method: string;
  url: string;
  params?: unknown;
  pathVariables?: unknown;
  headers?: unknown;
  body?: unknown;
  description?: string | null;
  folderId?: string | null;
  examples: { name: string; code: number; status: string; headers?: unknown; body?: string | null; language?: string }[];
}
interface Folder { id: string; name: string }

const kvs = (v: unknown): KV[] => (Array.isArray(v) ? (v as KV[]).filter((x) => x && x.key && x.enabled !== false) : []);
const SKIP_HEADERS = /^(content-type|accept|authorization|user-agent|host|content-length|cookie)$/i;
const METHODS = new Set(['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace']);

/** Splits `{{baseUrl}}/users/:id?x=1` into a server (variable part, if any) and an OpenAPI path with `{id}`. */
export function splitUrl(raw: string) {
  const noQuery = (raw || '').split('?')[0].trim();
  const m = /^(\{\{[^}]+\}\}|https?:\/\/[^/]+)(\/.*)?$/.exec(noQuery);
  const server = m ? m[1] : '';
  const path = (m ? m[2] || '/' : noQuery.startsWith('/') ? noQuery : `/${noQuery}`).replace(/\/\{\{[^}]+\}\}/g, (x) => `/{${x.slice(3, -2)}}`).replace(/\/:([A-Za-z0-9_]+)/g, '/{$1}');
  return { server: server.startsWith('{{') ? '' : server, path: path || '/' };
}

/** A JSON Schema guessed from an example value (types and nesting only). */
export function schemaOf(v: unknown, depth = 0): Record<string, unknown> {
  if (v === null) return { nullable: true };
  if (Array.isArray(v)) return { type: 'array', items: v.length && depth < 5 ? schemaOf(v[0], depth + 1) : {} };
  if (typeof v === 'object') {
    const props = depth < 5 ? Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, schemaOf(x, depth + 1)])) : {};
    return { type: 'object', properties: props };
  }
  if (typeof v === 'number') return { type: Number.isInteger(v) ? 'integer' : 'number' };
  if (typeof v === 'boolean') return { type: 'boolean' };
  return { type: 'string' };
}

const parse = (s?: string | null) => {
  if (!s) return undefined;
  try {
    return JSON.parse(s);
  } catch {
    return undefined;
  }
};

export function buildOpenApi(collection: { name: string; description?: string | null }, requests: Req[], folders: Folder[]) {
  const folderName = new Map(folders.map((f) => [f.id, f.name]));
  const paths: Record<string, Record<string, unknown>> = {};
  const servers = new Set<string>();
  const used = new Set<string>();

  for (const r of requests) {
    const method = (r.method || 'GET').toLowerCase();
    if (!METHODS.has(method)) continue;
    const { server, path } = splitUrl(r.url);
    if (server) servers.add(server);
    let id = r.name.replace(/[^A-Za-z0-9]+/g, ' ').trim().replace(/ (\w)/g, (_, c) => c.toUpperCase()) || `${method}${path}`;
    while (used.has(id)) id += '_';
    used.add(id);

    const parameters: unknown[] = [];
    for (const p of kvs(r.params)) parameters.push({ name: p.key, in: 'query', required: false, schema: { type: 'string' }, ...(p.value ? { example: p.value } : {}), ...(p.description ? { description: p.description } : {}) });
    for (const name of [...path.matchAll(/\{([^}]+)\}/g)].map((m) => m[1])) {
      const given = kvs(r.pathVariables).find((p) => p.key === name);
      parameters.push({ name, in: 'path', required: true, schema: { type: 'string' }, ...(given?.value ? { example: given.value } : {}) });
    }
    for (const h of kvs(r.headers)) if (!SKIP_HEADERS.test(h.key!)) parameters.push({ name: h.key, in: 'header', required: false, schema: { type: 'string' }, ...(h.value ? { example: h.value } : {}) });

    const op: Record<string, unknown> = { operationId: id, summary: r.name, parameters, responses: {} };
    if (r.description) op.description = r.description;
    if (r.folderId && folderName.has(r.folderId)) op.tags = [folderName.get(r.folderId)];

    const body = r.body as { mode?: string; raw?: string; urlencoded?: KV[]; formdata?: KV[] } | null;
    if (body?.mode === 'raw' && body.raw?.trim()) {
      const json = parse(body.raw);
      op.requestBody = json !== undefined ? { content: { 'application/json': { schema: schemaOf(json), example: json } } } : { content: { 'text/plain': { schema: { type: 'string' }, example: body.raw.slice(0, 2000) } } };
    } else if (body?.mode === 'urlencoded' || body?.mode === 'formdata') {
      const fields = kvs(body.mode === 'urlencoded' ? body.urlencoded : body.formdata);
      if (fields.length) op.requestBody = { content: { [body.mode === 'urlencoded' ? 'application/x-www-form-urlencoded' : 'multipart/form-data']: { schema: { type: 'object', properties: Object.fromEntries(fields.map((f) => [f.key, { type: 'string' }])) } } } };
    }

    const responses = op.responses as Record<string, unknown>;
    for (const ex of r.examples) {
      const code = String(ex.code || 200);
      const json = parse(ex.body);
      const entry = (responses[code] as { description: string; content?: Record<string, any> }) || { description: ex.status || ex.name };
      if (ex.body) {
        entry.content = entry.content || {};
        const type = json !== undefined ? 'application/json' : 'text/plain';
        entry.content[type] = entry.content[type] || (json !== undefined ? { schema: schemaOf(json), examples: {} } : { schema: { type: 'string' }, examples: {} });
        entry.content[type].examples[ex.name.replace(/\s+/g, '_') || 'example'] = { summary: ex.name, value: json !== undefined ? json : ex.body.slice(0, 2000) };
      }
      responses[code] = entry;
    }
    if (!Object.keys(responses).length) responses.default = { description: 'No saved example response yet' };

    paths[path] = { ...(paths[path] || {}), [method]: op };
  }

  return {
    openapi: '3.0.3',
    info: { title: collection.name, description: collection.description || undefined, version: '1.0.0' },
    servers: servers.size ? [...servers].map((url) => ({ url })) : [{ url: '/' }],
    tags: [...new Set(requests.map((r) => (r.folderId ? folderName.get(r.folderId) : undefined)).filter(Boolean))].map((name) => ({ name })),
    paths,
  };
}
