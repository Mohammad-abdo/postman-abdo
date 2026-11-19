import { ApiModel, Contract, Endpoint, FieldDef } from './types';
import { isObj, titleCase } from './util';

export interface ListShape {
  /** JSONPath of the array inside the response body. */
  path: string;
  sample: Record<string, any> | undefined;
  totalPath?: string;
}

const TOTAL_KEYS = /^(total|totalcount|total_count|count|totalitems|total_items|totalelements|totalrecords)$/i;
const PAGING = /^(page|pagenumber|page_number|offset|skip|cursor|after|before|limit|per_page|perpage|pagesize|page_size|size|take)$/i;
const SORT = /^(sort|sortby|sort_by|order|orderby|order_by|direction|dir)$/i;
const SEARCH = /^(q|search|query|keyword|term)$/i;

export const successExample = (e: Endpoint) => e.examples.find((x) => x.code >= 200 && x.code < 300 && x.body !== undefined) || e.examples.find((x) => x.code >= 200 && x.code < 300);

/** Finds the array of records in an example response (top-level or up to two levels deep). */
export function findList(body: unknown): ListShape | null {
  if (Array.isArray(body)) return { path: '$', sample: isObj(body[0]) ? body[0] : undefined };
  if (!isObj(body)) return null;
  const search = (obj: Record<string, any>, prefix: string, depth: number): ListShape | null => {
    for (const [k, v] of Object.entries(obj)) if (Array.isArray(v)) return { path: `${prefix}.${k}`, sample: isObj(v[0]) ? v[0] : undefined };
    if (depth < 2) for (const [k, v] of Object.entries(obj)) if (isObj(v)) {
      const r = search(v, `${prefix}.${k}`, depth + 1);
      if (r) return r;
    }
    return null;
  };
  const found = search(body, '$', 0);
  if (!found) return null;
  const total = findKey(body, '$', 0, TOTAL_KEYS);
  return { ...found, totalPath: total };
}

function findKey(obj: Record<string, any>, prefix: string, depth: number, re: RegExp): string | undefined {
  for (const [k, v] of Object.entries(obj)) if (re.test(k) && typeof v === 'number') return `${prefix}.${k}`;
  if (depth < 2) for (const [k, v] of Object.entries(obj)) if (isObj(v)) {
    const r = findKey(v, `${prefix}.${k}`, depth + 1, re);
    if (r) return r;
  }
  return undefined;
}

export function columnsFor(sample: Record<string, any> | undefined): string[] {
  if (!sample) return [];
  const scalar = Object.keys(sample).filter((k) => sample[k] === null || typeof sample[k] !== 'object');
  const pref = ['id', 'name', 'title', 'email', 'status', 'type'];
  return [...pref.filter((p) => scalar.includes(p)), ...scalar.filter((k) => !pref.includes(k))].slice(0, 8);
}

export function idFieldOf(sample: Record<string, any> | undefined): string {
  if (!sample) return 'id';
  if ('id' in sample) return 'id';
  return Object.keys(sample).find((k) => /id$/i.test(k)) || 'id';
}

export function paging(e: Endpoint) {
  const names = e.query.map((q) => q.name);
  const pick = (re: RegExp) => names.find((n) => re.test(n));
  const cursor = pick(/^(cursor|after|before)$/i);
  const offset = pick(/^(offset|skip)$/i);
  const page = pick(/^(page|pagenumber|page_number)$/i);
  const size = pick(/^(limit|per_page|perpage|pagesize|page_size|size|take)$/i);
  if (!cursor && !offset && !page && !size) return null;
  return { kind: cursor ? 'cursor' : offset ? 'offset' : 'page', params: { page, offset, cursor, size } };
}

export const sortParams = (e: Endpoint) => e.query.map((q) => q.name).filter((n) => SORT.test(n));
export const searchParam = (e: Endpoint) => e.query.map((q) => q.name).find((n) => SEARCH.test(n));
export const filterParams = (e: Endpoint) => e.query.map((q) => q.name).filter((n) => !PAGING.test(n) && !SORT.test(n) && !SEARCH.test(n));

export function inputFor(name: string, sample: unknown, fileKind?: boolean): FieldDef['input'] {
  if (fileKind) return 'file';
  if (/pass(word)?$/i.test(name)) return 'password';
  if (/e-?mail/i.test(name)) return 'email';
  if (/(date|_at|At|time)$/.test(name) || /(birth|expires)/i.test(name)) return 'date';
  if (typeof sample === 'boolean') return 'checkbox';
  if (typeof sample === 'number') return 'number';
  if (/(description|content|notes?|comment|message|body|bio)$/i.test(name)) return 'textarea';
  return 'text';
}

/** Form fields for an endpoint's request body (+ path params when asked). */
export function formFields(e: Endpoint, opts: { withPath?: boolean; skipId?: boolean } = {}): FieldDef[] {
  const out: FieldDef[] = [];
  if (opts.withPath) e.pathParams.forEach((p) => out.push({ name: p.name, in: 'path', input: 'text', example: p.example }));
  const ex = e.body.example;
  if (isObj(ex)) {
    Object.entries(ex).forEach(([k, v]) => {
      if (opts.skipId && k === 'id') return;
      if (v !== null && typeof v === 'object') return out.push({ name: k, in: 'body', input: 'textarea', example: JSON.stringify(v) });
      out.push({ name: k, in: 'body', input: inputFor(k, v), example: v == null ? '' : String(v) });
    });
  }
  e.body.fields.forEach((f) => out.push({ name: f.name, in: 'form', input: inputFor(f.name, f.example, f.kind === 'file'), example: f.example }));
  if (e.body.mode === 'raw' && !isObj(ex) && ex === undefined && e.body.contentType === undefined && e.method !== 'GET') {
    /* raw non-JSON body: no structured fields; the explorer/response viewer covers it */
  }
  return out;
}

export function queryFields(e: Endpoint): FieldDef[] {
  return e.query.map((q) => ({ name: q.name, in: 'query' as const, input: inputFor(q.name, q.example), example: q.example }));
}

export const singularTitle = (resourceId: string) => {
  const n = resourceId.split('.').pop() as string;
  const t = titleCase(n);
  return /ies$/i.test(t) ? t.replace(/ies$/i, 'y') : /(ss|us)$/i.test(t) ? t : t.replace(/s$/i, '');
};

export const contractOf = (c: Contract, key: string) => c.endpoints[key];
export const epOf = (m: ApiModel, key: string) => m.endpoints.find((e) => e.key === key) as Endpoint;
