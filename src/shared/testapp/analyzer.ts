import { ApiModel, Endpoint, ExampleModel, Param, Warning } from './types';
import { hashOf, isObj } from './util';

export const ANALYZER_LIMITS = { maxEndpoints: 5000, maxDepth: 20, maxExampleChars: 2_000_000 };

type Json = any;
const SENSITIVE_HEADER = /^(authorization|proxy-authorization|cookie|set-cookie|x-api-key|api-key|x-auth-token)$/i;
const VERSION_PREFIX = /^(api|v\d+(\.\d+)?|rest)$/i;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Postman `[{key,value}]` list or already-flat object → Param-ish list. */
const asList = (v: Json): Json[] => (Array.isArray(v) ? v : []);

function rawUrl(url: Json): string {
  if (!url) return '';
  if (typeof url === 'string') return url;
  if (typeof url.raw === 'string' && url.raw) return url.raw;
  const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
  const path = Array.isArray(url.path) ? url.path.join('/') : url.path || '';
  return `${url.protocol ? url.protocol + '://' : ''}${host}${url.port ? ':' + url.port : ''}/${path}`;
}

/** Splits a raw URL into host token and path segments. `{{baseUrl}}` is treated as the host. */
export function splitUrl(raw: string): { host: string | null; segments: string[]; query: string } {
  let rest = raw.trim();
  const q = rest.indexOf('?');
  const query = q >= 0 ? rest.slice(q + 1).split('#')[0] : '';
  if (q >= 0) rest = rest.slice(0, q);
  rest = rest.split('#')[0];
  let host: string | null = null;
  const proto = rest.match(/^[a-z][\w+.-]*:\/\//i);
  if (proto) rest = rest.slice(proto[0].length);
  if (proto || rest.startsWith('{{')) {
    const m = rest.startsWith('{{') ? rest.match(/^\{\{[^}]+\}\}[^/]*/) : rest.match(/^[^/]*/);
    host = m ? m[0] : null;
    rest = rest.slice(host ? host.length : 0);
  } else if (/^[^/{:]+\.[a-z]{2,}(:\d+)?(\/|$)/i.test(rest)) {
    const m = rest.match(/^[^/]*/);
    host = m ? m[0] : null;
    rest = rest.slice(host ? host.length : 0);
  }
  const segments = rest.split('/').filter(Boolean);
  return { host, segments, query };
}

function normalizeSegment(seg: string, pathVarNames: Set<string>): { text: string; param: string | null } {
  let m = seg.match(/^:(.+)$/);
  if (m) return { text: `{${m[1]}}`, param: m[1] };
  m = seg.match(/^\{\{(.+)\}\}$/) || seg.match(/^\{(.+)\}$/) || seg.match(/^<(.+)>$/);
  if (m) return { text: `{${m[1].trim()}}`, param: m[1].trim() };
  if (/^\d+$/.test(seg) || UUID.test(seg)) return { text: '{id}', param: 'id' };
  if (pathVarNames.has(seg)) return { text: `{${seg}}`, param: seg };
  return { text: seg, param: null };
}

function execText(events: Json): { pre: string; test: string } {
  const out = { pre: '', test: '' };
  asList(events).forEach((e) => {
    const exec = e?.script?.exec;
    const code = Array.isArray(exec) ? exec.join('\n') : typeof exec === 'string' ? exec : '';
    if (e.listen === 'prerequest') out.pre = code;
    if (e.listen === 'test') out.test = code;
  });
  return out;
}

/** Static scan only — scripts are NEVER executed. */
function scanScripts(code: string) {
  const sets: string[] = [];
  const extracts: { variable: string; expression: string }[] = [];
  const re = /pm\.(?:environment|collectionVariables|globals|variables)\.set\(\s*(["'`])([^"'`]+)\1\s*,\s*([^;\n]*?)\)\s*;?\s*$/gm;
  for (const m of code.matchAll(re)) {
    sets.push(m[2]);
    extracts.push({ variable: m[2], expression: m[3].trim() });
  }
  // legacy `postman.setEnvironmentVariable("x", ...)`
  for (const m of code.matchAll(/postman\.set(?:Environment|Global)Variable\(\s*(["'`])([^"'`]+)\1\s*,\s*([^;\n]*?)\)/g)) {
    sets.push(m[2]);
    extracts.push({ variable: m[2], expression: m[3].trim() });
  }
  return { sets: [...new Set(sets)], extracts };
}

const usedVars = (text: string) => [...new Set([...text.matchAll(/\{\{\s*([^{}\s]+)\s*\}\}/g)].map((m) => m[1]))];

function parseExample(r: Json): ExampleModel {
  const headers: Record<string, string> = {};
  asList(r.header).forEach((h) => h?.key && !SENSITIVE_HEADER.test(String(h.key)) && (headers[String(h.key)] = String(h.value ?? '')));
  const raw = typeof r.body === 'string' ? r.body : r.body == null ? '' : JSON.stringify(r.body);
  let body: unknown;
  if (raw && raw.length <= ANALYZER_LIMITS.maxExampleChars) {
    try {
      body = JSON.parse(raw);
    } catch {
      body = undefined;
    }
  }
  return { name: String(r.name || 'Example'), code: Number(r.code) || 200, headers, body, raw: raw.length > ANALYZER_LIMITS.maxExampleChars ? '' : raw };
}

function bodyOf(request: Json): Endpoint['body'] & { _fields?: Param[] } {
  const b = request?.body;
  if (!b || !b.mode) return { mode: 'none', fields: [] };
  const fields: Param[] = [];
  let example: unknown;
  let contentType: string | undefined;
  if (b.mode === 'raw') {
    try {
      example = JSON.parse(b.raw || '');
      contentType = 'application/json';
    } catch {
      example = typeof b.raw === 'string' ? b.raw : undefined;
    }
  } else if (b.mode === 'formdata') {
    asList(b.formdata).filter((f) => f?.key && !f.disabled).forEach((f) =>
      fields.push({ name: String(f.key), in: 'form', kind: f.type === 'file' ? 'file' : 'text', example: f.type === 'file' ? undefined : String(f.value ?? ''), description: f.description }),
    );
    contentType = 'multipart/form-data';
  } else if (b.mode === 'urlencoded') {
    asList(b.urlencoded).filter((f) => f?.key && !f.disabled).forEach((f) => fields.push({ name: String(f.key), in: 'form', kind: 'text', example: String(f.value ?? ''), description: f.description }));
    contentType = 'application/x-www-form-urlencoded';
  }
  return { mode: String(b.mode), fields, example, contentType };
}

/**
 * Builds the normalized API model from a Postman v2.1 collection JSON. Pure: no I/O, never evaluates scripts.
 */
export function analyzeCollection(collection: Json, opts: { sourceHash?: string } = {}): ApiModel {
  const warnings: Warning[] = [];
  const endpoints: Endpoint[] = [];
  const keyCounts = new Map<string, number>();
  let order = 0;
  let folderCount = 0;
  const collectionAuth = collection?.auth?.type || 'noauth';

  const walk = (items: Json[], folderPath: string[], inheritedAuth: string, depth: number) => {
    if (depth > ANALYZER_LIMITS.maxDepth) {
      warnings.push({ code: 'DEPTH_LIMIT', message: `Folder nesting deeper than ${ANALYZER_LIMITS.maxDepth} was skipped` });
      return;
    }
    for (const item of asList(items)) {
      if (!isObj(item)) continue;
      if (Array.isArray(item.item)) {
        folderCount++;
        walk(item.item, [...folderPath, String(item.name || 'Folder')], item.auth?.type || inheritedAuth, depth + 1);
        continue;
      }
      if (endpoints.length >= ANALYZER_LIMITS.maxEndpoints) {
        if (!warnings.some((w) => w.code === 'ENDPOINT_LIMIT')) warnings.push({ code: 'ENDPOINT_LIMIT', message: `Only the first ${ANALYZER_LIMITS.maxEndpoints} requests were analyzed` });
        return;
      }
      const request: Json = typeof item.request === 'string' ? { method: 'GET', url: item.request } : item.request || {};
      const raw = rawUrl(request.url);
      const { host, segments: rawSegments, query } = splitUrl(raw);
      const pathVarNames = new Set<string>(asList(request.url?.variable).map((v) => String(v.key)));
      const norm = rawSegments.map((s) => normalizeSegment(s, pathVarNames));
      const path = '/' + norm.map((n) => n.text).join('/');
      const grouping = norm.map((n) => n.text);
      while (grouping.length > 1 && VERSION_PREFIX.test(grouping[0])) grouping.shift();

      const method = String(request.method || 'GET').toUpperCase();
      const baseKey = `${method} ${path}`;
      const seen = (keyCounts.get(baseKey) || 0) + 1;
      keyCounts.set(baseKey, seen);
      const key = seen > 1 ? `${baseKey}#${seen}` : baseKey;
      if (seen > 1) warnings.push({ code: 'DUPLICATE_ENDPOINT', message: `Duplicate endpoint ${baseKey}`, endpoint: key });

      const pathParams: Param[] = norm
        .filter((n) => n.param)
        .map((n) => ({ name: n.param as string, in: 'path' as const, example: asList(request.url?.variable).find((v) => v.key === n.param)?.value }));
      const queryParams: Param[] = [
        ...asList(request.url?.query).filter((q) => q?.key && !q.disabled).map((q) => ({ name: String(q.key), in: 'query' as const, example: q.value == null ? undefined : String(q.value), description: typeof q.description === 'string' ? q.description : undefined })),
      ];
      if (!Array.isArray(request.url?.query) && query) {
        new URLSearchParams(query).forEach((value, name) => queryParams.push({ name, in: 'query', example: value }));
      }
      const headers: Param[] = asList(request.header).filter((h) => h?.key && !h.disabled).map((h) => ({ name: String(h.key), in: 'header' as const, example: SENSITIVE_HEADER.test(String(h.key)) ? undefined : String(h.value ?? '') }));

      const scripts = execText(item.event);
      const hints = scanScripts(scripts.test + '\n' + scripts.pre);
      const reads = usedVars(raw + ' ' + JSON.stringify(request.header || []) + ' ' + JSON.stringify(request.body || '') + ' ' + JSON.stringify(request.auth || ''));
      const body = bodyOf(request);
      const examples = asList(item.response).map(parseExample);
      if (!examples.length) warnings.push({ code: 'NO_EXAMPLES', message: `${key} has no saved response examples; its response schema is unknown`, endpoint: key });

      const ownAuth = request.auth?.type as string | undefined;
      const authType = ownAuth && ownAuth !== 'inherit' ? ownAuth : inheritedAuth;

      endpoints.push({
        key,
        id: String(item.id || key),
        name: String(item.name || key),
        method,
        urlTemplate: raw,
        path,
        segments: grouping,
        host,
        folderPath,
        order: order++,
        pathParams,
        query: queryParams,
        headers,
        body,
        auth: { type: authType || 'noauth', inherited: !ownAuth || ownAuth === 'inherit' },
        examples,
        scriptHints: { sets: hints.sets, extracts: hints.extracts, reads },
        flags: { external: false, multipart: body.mode === 'formdata', fileUpload: body.fields.some((f) => f.kind === 'file') || body.mode === 'file' },
      });
    }
  };

  walk(collection?.item, [], collectionAuth, 0);

  // External hosts: a literal host that differs from the dominant host token.
  const hostCounts = new Map<string, number>();
  endpoints.forEach((e) => e.host && hostCounts.set(e.host, (hostCounts.get(e.host) || 0) + 1));
  const dominant = [...hostCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || null;
  endpoints.forEach((e) => {
    if (e.host && dominant && e.host !== dominant && !e.host.startsWith('{{')) {
      e.flags.external = true;
      warnings.push({ code: 'EXTERNAL_HOST', message: `${e.key} targets ${e.host}, different from ${dominant}`, endpoint: e.key });
    }
  });

  return {
    meta: {
      name: String(collection?.info?.name || 'Collection'),
      sourceHash: opts.sourceHash || hashOf(collection),
      endpointCount: endpoints.length,
      folderCount,
    },
    endpoints,
    warnings,
  };
}
