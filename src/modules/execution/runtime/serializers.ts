import { ReceivedResponse, SentRequest } from './runtime.types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk = require('postman-collection');

/** Converts postman-runtime / SDK objects into plain JSON for the client. */

const TEXT_CONTENT = /(json|xml|html|text|javascript|ecmascript|csv|yaml|graphql|x-www-form-urlencoded|svg)/i;

type Header = { key: string; value: string };

export function errorText(err: unknown): string | null {
  if (!err) return null;
  if (typeof err === 'string') return err;
  const e = err as { message?: string; name?: string };
  return e.message || e.name || String(err);
}

function headerList(headers: any): Header[] {
  if (!headers) return [];
  const list = typeof headers.all === 'function' ? headers.all() : headers;
  return list.filter((h: any) => h && !h.disabled).map((h: any) => ({ key: h.key, value: h.value == null ? '' : String(h.value) }));
}

const headerBytes = (headers: Header[]) => headers.reduce((n, h) => n + Buffer.byteLength(`${h.key}: ${h.value}\r\n`), 0);

function lastHop(history: any) {
  const data = history?.execution?.data || [];
  return data[data.length - 1];
}

const fileName = (src: unknown) => String(src || '').split(/[\\/]/).pop()?.split('__').pop();

function bodyAsText(request: any): string {
  const body = request?.body;
  if (!body?.mode) return '';
  const enabled = (list: any) => list.all().filter((p: any) => !p.disabled);
  switch (body.mode) {
    case 'raw':
      return String(body.raw ?? '');
    case 'urlencoded':
      return enabled(body.urlencoded)
        .map((p: any) => `${encodeURIComponent(p.key)}=${encodeURIComponent(p.value ?? '')}`)
        .join('&');
    case 'formdata':
      return enabled(body.formdata)
        .map((p: any) => (p.type === 'file' ? `${p.key}: <file ${fileName(p.src)}>` : `${p.key}: ${p.value}`))
        .join('\n');
    case 'file':
      return `<file ${fileName(body.file?.src)}>`;
    case 'graphql': {
      let variables: unknown = body.graphql?.variables;
      try {
        variables = JSON.parse(String(variables || '{}'));
      } catch {
        /* send as-is */
      }
      return JSON.stringify({ query: body.graphql?.query, variables });
    }
    default:
      return '';
  }
}

export function serializeRequest(request: any, history: any): SentRequest | null {
  if (!request) return null;
  const hop = lastHop(history);
  const headers: Header[] = hop?.request?.headers
    ? hop.request.headers.map((h: any) => ({ key: h.key, value: String(h.value) }))
    : headerList(request.headers);
  const body = bodyAsText(request);
  return {
    method: hop?.request?.method || request.method,
    url: hop?.request?.href || request.url.toString(),
    headers,
    body,
    size: { headers: headerBytes(headers), body: Buffer.byteLength(body) },
  };
}

export function serializeResponse(response: any, history: any, cookies: any[]): ReceivedResponse | null {
  if (!response) return null;
  const headers = headerList(response.headers);
  const stream: Buffer = response.stream ? Buffer.from(response.stream) : Buffer.alloc(0);
  const contentType = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value || '';
  const isText = !contentType || TEXT_CONTENT.test(contentType);
  const hop = lastHop(history);
  const session = hop?.session?.id ? history.execution.sessions?.[hop.session.id] : null;
  const status = response.status || response.reason?.()?.detail || '';
  const headersSize = headerBytes(headers) + Buffer.byteLength(`HTTP/1.1 ${response.code} ${status}\r\n`);

  let timings: Record<string, number> | null = null;
  try {
    timings = hop?.timings ? sdk.Response.timingPhases(hop.timings) : null;
  } catch {
    timings = null;
  }

  return {
    code: response.code,
    status,
    headers,
    cookies: (cookies || []).map((c) => ({
      name: c.name ?? c.key,
      value: c.value,
      domain: c.domain,
      path: c.path,
      expires: c.expires ? new Date(c.expires).toString() : 'Session',
      httpOnly: !!c.httpOnly,
      secure: !!c.secure,
    })),
    body: isText ? stream.toString('utf8') : '',
    bodyBase64: isText ? null : stream.toString('base64'),
    contentType,
    isText,
    responseTime: response.responseTime,
    size: { body: stream.length, headers: headersSize, total: stream.length + headersSize },
    timings,
    network: session ? { localAddress: session.addresses?.local, remoteAddress: session.addresses?.remote, tls: session.tls } : null,
    redirects: (history?.execution?.data || []).slice(0, -1).map((d: any) => ({
      url: d.request?.href,
      method: d.request?.method,
      code: d.response?.statusCode,
    })),
  };
}

/** Folder names leading to an item, outermost first. */
export function itemPath(item: any): string[] {
  const path: string[] = [];
  let parent = item?.parent?.();
  while (parent && parent.parent) {
    if (parent.name) path.unshift(parent.name);
    parent = parent.parent();
  }
  return path;
}

export const stripBody = <T extends { response: ReceivedResponse | null }>(execution: T): T => ({
  ...execution,
  response: execution.response && { ...execution.response, body: undefined, bodyBase64: undefined },
});
