import { AuthModel, FormDataField, KeyValue, RequestModel, emptyBody } from '../../shared/postman/types';
import { parseQueryString } from '../../shared/postman/kv.mapper';

/** Parses a cURL command (bash or cmd quoting) into our request model. */

function tokenize(input: string): string[] {
  const src = input.replace(/\\\r?\n/g, ' ').replace(/\^\r?\n/g, ' ');
  const tokens: string[] = [];
  let cur = '';
  let i = 0;
  let has = false;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) {
      if (has) tokens.push(cur);
      cur = '';
      has = false;
      i++;
      continue;
    }
    has = true;
    if (c === "'") {
      const end = src.indexOf("'", i + 1);
      cur += src.slice(i + 1, end < 0 ? undefined : end);
      i = end < 0 ? src.length : end + 1;
    } else if (c === '$' && src[i + 1] === "'") {
      i += 2;
      while (i < src.length && src[i] !== "'") {
        if (src[i] === '\\' && i + 1 < src.length) {
          const n = src[i + 1];
          cur += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '\r' : n;
          i += 2;
        } else cur += src[i++];
      }
      i++;
    } else if (c === '"') {
      i++;
      while (i < src.length && src[i] !== '"') {
        if (src[i] === '\\' && i + 1 < src.length && '"\\$`'.includes(src[i + 1])) {
          cur += src[i + 1];
          i += 2;
        } else cur += src[i++];
      }
      i++;
    } else if (c === '\\' && i + 1 < src.length) {
      cur += src[i + 1];
      i += 2;
    } else {
      cur += c;
      i++;
    }
  }
  if (has) tokens.push(cur);
  return tokens;
}

const kv = (key: string, value: string): KeyValue => ({ key, value, enabled: true, description: '' });

export function parseCurl(command: string): RequestModel {
  const tokens = tokenize(command.trim());
  if (tokens[0]?.toLowerCase() === 'curl') tokens.shift();
  let method = '';
  let url = '';
  const headers: KeyValue[] = [];
  const data: string[] = [];
  const urlencodedData: string[] = [];
  const form: FormDataField[] = [];
  let user = '';
  let get = false;
  let json = false;
  const settings: Record<string, unknown> = {};

  for (let i = 0; i < tokens.length; i++) {
    let t = tokens[i];
    let inline: string | null = null;
    if (t.startsWith('--') && t.includes('=')) {
      inline = t.slice(t.indexOf('=') + 1);
      t = t.slice(0, t.indexOf('='));
    }
    const val = () => (inline !== null ? inline : tokens[++i] ?? '');
    switch (t) {
      case '-X':
      case '--request':
        method = val().toUpperCase();
        break;
      case '-H':
      case '--header': {
        const h = val();
        const idx = h.indexOf(':');
        if (idx > 0) headers.push(kv(h.slice(0, idx).trim(), h.slice(idx + 1).trim()));
        break;
      }
      case '-d':
      case '--data':
      case '--data-raw':
      case '--data-binary':
      case '--data-ascii':
        data.push(val());
        break;
      case '--data-urlencode':
        urlencodedData.push(val());
        break;
      case '--json':
        json = true;
        data.push(val());
        break;
      case '-F':
      case '--form':
      case '--form-string': {
        const f = val();
        const idx = f.indexOf('=');
        const key = f.slice(0, idx);
        const value = f.slice(idx + 1);
        if (value.startsWith('@')) form.push({ key, value: '', type: 'file', src: value.slice(1).split(';')[0], enabled: true });
        else form.push({ key, value, type: 'text', enabled: true });
        break;
      }
      case '-u':
      case '--user':
        user = val();
        break;
      case '-A':
      case '--user-agent':
        headers.push(kv('User-Agent', val()));
        break;
      case '-b':
      case '--cookie':
        headers.push(kv('Cookie', val()));
        break;
      case '-e':
      case '--referer':
        headers.push(kv('Referer', val()));
        break;
      case '-G':
      case '--get':
        get = true;
        break;
      case '-I':
      case '--head':
        method = 'HEAD';
        break;
      case '-k':
      case '--insecure':
        settings.strictSSL = false;
        break;
      case '--url':
        url = val();
        break;
      case '-L':
      case '--location':
        settings.followRedirects = true;
        break;
      case '-o':
      case '--output':
      case '-m':
      case '--max-time':
      case '--connect-timeout':
      case '-w':
      case '--write-out':
        val();
        break;
      default:
        if (!t.startsWith('-') && !url) url = t;
    }
  }

  if (json) {
    if (!headers.find((h) => h.key.toLowerCase() === 'content-type')) headers.push(kv('Content-Type', 'application/json'));
    if (!headers.find((h) => h.key.toLowerCase() === 'accept')) headers.push(kv('Accept', 'application/json'));
  }

  const body = emptyBody();
  const contentType = headers.find((h) => h.key.toLowerCase() === 'content-type')?.value || '';

  if (get && (data.length || urlencodedData.length)) {
    const qs = [...data, ...urlencodedData].join('&');
    url += (url.includes('?') ? '&' : '?') + qs;
  } else if (form.length) {
    body.mode = 'formdata';
    body.formdata = form;
  } else if (urlencodedData.length || (data.length && /x-www-form-urlencoded/i.test(contentType)) || (data.length && !contentType && data.every((d) => /^[^{[<\s][^=\s]*=/.test(d)))) {
    body.mode = 'urlencoded';
    [...data, ...urlencodedData]
      .join('&')
      .split('&')
      .filter(Boolean)
      .forEach((pair) => {
        const i = pair.indexOf('=');
        const k = i >= 0 ? pair.slice(0, i) : pair;
        const v = i >= 0 ? pair.slice(i + 1) : '';
        let dv = v;
        try {
          dv = decodeURIComponent(v.replace(/\+/g, ' '));
        } catch {
          /* keep raw */
        }
        body.urlencoded.push(kv(k, dv));
      });
  } else if (data.length) {
    body.mode = 'raw';
    body.raw = data.join('&');
    body.rawLanguage = /json/i.test(contentType) || /^\s*[[{]/.test(body.raw) ? 'json' : /xml/i.test(contentType) ? 'xml' : /html/i.test(contentType) ? 'html' : 'text';
  }

  if (!method) method = body.mode !== 'none' ? 'POST' : 'GET';
  if (url && !/^[a-z]+:\/\//i.test(url) && !url.startsWith('{{')) url = 'http://' + url;

  const auth: AuthModel = { type: 'inherit' };
  if (user) {
    const idx = user.indexOf(':');
    auth.type = 'basic';
    auth.basic = { username: idx >= 0 ? user.slice(0, idx) : user, password: idx >= 0 ? user.slice(idx + 1) : '' };
  }

  const queryIndex = url.indexOf('?');
  const params = queryIndex >= 0 ? parseQueryString(url.slice(queryIndex + 1).split('#')[0]) : [];

  return {
    name: url || 'Untitled Request',
    method,
    url,
    params,
    pathVariables: [],
    headers,
    body,
    auth,
    preRequestScript: '',
    testScript: '',
    settings,
    description: '',
  };
}
