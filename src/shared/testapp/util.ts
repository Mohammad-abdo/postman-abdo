import crypto from 'crypto';

/** JSON.stringify with sorted keys, so equal data always hashes equally. */
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const obj = value as Record<string, unknown>;
  return `{${Object.keys(obj)
    .sort()
    .filter((k) => obj[k] !== undefined)
    .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
    .join(',')}}`;
}

export const sha256 = (text: string) => crypto.createHash('sha256').update(text).digest('hex');
export const hashOf = (value: unknown) => sha256(stableStringify(value));

/** Seeded PRNG (mulberry32). `state` is the next seed, so a stream can be resumed. */
export class Rng {
  constructor(public state: number) {
    this.state = state >>> 0;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(min: number, max: number) {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }
  hex(len: number) {
    let s = '';
    while (s.length < len) s += Math.floor(this.next() * 16).toString(16);
    return s;
  }
}

export const clone = <T>(v: T): T => (v === undefined ? v : JSON.parse(JSON.stringify(v)));

export const isObj = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);

/** Reads `$.a.b[0].c` style paths. Closed evaluator: no scripts. */
export function getPath(data: unknown, path: string): unknown {
  if (!path || path === '$') return data;
  const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || [];
  let cur: any = data;
  for (const t of tokens) {
    if (cur == null) return undefined;
    cur = cur[t];
  }
  return cur;
}

export function setPath(data: any, path: string, value: unknown): any {
  if (!path || path === '$') return value;
  const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || [];
  let cur = data;
  tokens.slice(0, -1).forEach((t) => (cur = cur?.[t]));
  if (cur && typeof cur === 'object') cur[tokens[tokens.length - 1]] = value;
  return data;
}

export const titleCase = (s: string) =>
  s
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();

export const singular = (s: string) => (/ies$/.test(s) ? s.replace(/ies$/, 'y') : /(ss|us)$/.test(s) ? s : s.replace(/s$/, ''));
