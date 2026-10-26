import { kvFromV2, kvToV21, parseQueryString } from './kv.mapper';
import { KeyValue, V2Json } from './types';

/** `/users/:id` → [{key:'id'}], keeping values already known. */
export function pathVariablesFromRaw(raw: string, known: KeyValue[] = []): KeyValue[] {
  const pathOnly = raw.split('?')[0];
  return Array.from(pathOnly.matchAll(/\/:([A-Za-z0-9_\-.]+)/g)).map(
    ([, name]) => known.find((k) => k.key === name) || { key: name, value: '', description: '' },
  );
}

function queryFromRaw(raw: string): KeyValue[] {
  const q = raw.indexOf('?');
  return q >= 0 ? parseQueryString(raw.slice(q + 1).split('#')[0]) : [];
}

/** Splits a raw URL into the v2.1 url object, keeping our param metadata (disabled flags, descriptions). */
export function urlToV21(raw: string, params?: KeyValue[] | null, pathVariables?: KeyValue[] | null): V2Json {
  const url: V2Json = { raw: raw || '' };
  let rest = raw || '';

  const hashIdx = rest.indexOf('#');
  if (hashIdx >= 0) {
    url.hash = rest.slice(hashIdx + 1);
    rest = rest.slice(0, hashIdx);
  }
  const qIdx = rest.indexOf('?');
  if (qIdx >= 0) rest = rest.slice(0, qIdx);

  const protocol = rest.match(/^([a-zA-Z][\w+.-]*):\/\//);
  if (protocol) {
    url.protocol = protocol[1];
    rest = rest.slice(protocol[0].length);
  }

  const slash = rest.indexOf('/');
  let host = slash >= 0 ? rest.slice(0, slash) : rest;
  const port = host.match(/^(.+):(\d+|\{\{[^}]+\}\})$/);
  if (port) {
    url.port = port[2];
    host = port[1];
  }
  url.host = host ? host.split('.') : [];
  url.path = slash >= 0 ? rest.slice(slash + 1).split('/') : [];

  const query = kvToV21(params && params.length ? params : queryFromRaw(raw || ''));
  if (query.length) url.query = query;

  const variables = (pathVariables || [])
    .filter((v) => v && v.key)
    .map((v) => ({ key: v.key, value: v.value ?? '', ...(v.description ? { description: v.description } : {}) }));
  if (variables.length) url.variable = variables;
  return url;
}

export function urlFromV2(url: V2Json): { raw: string; params: KeyValue[]; pathVariables: KeyValue[] } {
  if (!url) return { raw: '', params: [], pathVariables: [] };
  if (typeof url === 'string') return { raw: url, params: queryFromRaw(url), pathVariables: pathVariablesFromRaw(url) };

  let raw: string = url.raw;
  if (!raw) {
    const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
    const p = Array.isArray(url.path) ? url.path.join('/') : url.path || '';
    raw = `${url.protocol ? url.protocol + '://' : ''}${host}${url.port ? ':' + url.port : ''}${p ? '/' + p : ''}`;
    const enabled = (url.query || []).filter((q: V2Json) => !q.disabled);
    if (enabled.length) raw += '?' + enabled.map((q: V2Json) => (q.value == null ? q.key : `${q.key}=${q.value}`)).join('&');
  }
  const known = kvFromV2(url.variable).map(({ enabled: _enabled, ...v }) => v);
  return { raw, params: kvFromV2(url.query), pathVariables: pathVariablesFromRaw(raw, known) };
}
