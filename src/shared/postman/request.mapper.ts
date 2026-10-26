import { authFromV2, authToV21 } from './auth.mapper';
import { bodyFromV2, bodyToV21 } from './body.mapper';
import { descriptionText, kvFromV2, kvToV21, parseHeaderBlock } from './kv.mapper';
import { scriptsFromEvents, scriptsToEvents } from './script.mapper';
import { ExampleModel, RequestModel, V2Json } from './types';
import { urlFromV2, urlToV21 } from './url.mapper';

export interface RenderOptions {
  /** Resolve uploaded file ids into absolute paths (for execution). */
  forRun?: boolean;
}

function withoutEmpty(settings: Record<string, unknown> = {}) {
  return Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}

export function exampleToV21(ex: ExampleModel): V2Json {
  const orig = ex.request || {};
  return {
    id: ex.id,
    name: ex.name,
    originalRequest: {
      method: orig.method || 'GET',
      header: kvToV21(orig.headers),
      url: urlToV21(orig.url || '', orig.params, orig.pathVariables),
      ...(orig.body ? { body: bodyToV21(orig.body) } : {}),
    },
    status: ex.status,
    code: ex.code,
    _postman_previewlanguage: ex.language || 'json',
    header: kvToV21(ex.headers),
    cookie: [],
    body: ex.body || '',
  };
}

export function requestToV21Item(r: RequestModel, opts: RenderOptions = {}): V2Json {
  const item: V2Json = {
    id: r.id,
    name: r.name,
    request: {
      method: (r.method || 'GET').toUpperCase(),
      header: kvToV21(r.headers),
      url: urlToV21(r.url || '', r.params, r.pathVariables),
    },
    response: (r.examples || []).map(exampleToV21),
  };
  const body = bodyToV21(r.body, opts.forRun);
  if (body) item.request.body = body;
  const auth = authToV21(r.auth);
  if (auth) item.request.auth = auth;
  if (r.description) item.request.description = r.description;
  const events = scriptsToEvents(r.preRequestScript, r.testScript);
  if (events.length) item.event = events;
  const settings = withoutEmpty(r.settings);
  if (Object.keys(settings).length) item.protocolProfileBehavior = settings;
  return item;
}

export function requestFromV2Item(item: V2Json): RequestModel {
  const r = typeof item.request === 'string' ? { url: item.request, method: 'GET' } : item.request || {};
  const url = urlFromV2(r.url);
  const scripts = scriptsFromEvents(item.event);
  return {
    type: 'http',
    name: item.name || url.raw || 'Untitled Request',
    method: (r.method || 'GET').toUpperCase(),
    url: url.raw,
    params: url.params,
    pathVariables: url.pathVariables,
    headers: typeof r.header === 'string' ? parseHeaderBlock(r.header) : kvFromV2(r.header),
    body: bodyFromV2(r.body),
    auth: authFromV2(r.auth),
    preRequestScript: scripts.pre,
    testScript: scripts.test,
    settings: item.protocolProfileBehavior || {},
    description: descriptionText(r.description) || descriptionText(item.description),
  };
}

export function exampleFromV2(resp: V2Json, index: number): ExampleModel {
  const orig = resp.originalRequest ? requestFromV2Item({ request: resp.originalRequest }) : null;
  return {
    name: resp.name || `Example ${index + 1}`,
    request: orig && {
      method: orig.method,
      url: orig.url,
      params: orig.params,
      pathVariables: orig.pathVariables,
      headers: orig.headers,
      body: orig.body,
    },
    code: Number(resp.code) || 200,
    status: resp.status || 'OK',
    headers: kvFromV2(resp.header || []),
    body: typeof resp.body === 'string' ? resp.body : resp.body == null ? '' : JSON.stringify(resp.body, null, 2),
    language: resp._postman_previewlanguage || 'json',
    sortOrder: index,
  };
}
