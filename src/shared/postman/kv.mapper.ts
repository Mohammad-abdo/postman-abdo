import { KeyValue, V2Json } from './types';

export const descriptionText = (d: unknown): string =>
  typeof d === 'object' && d ? String((d as { content?: string }).content || '') : String(d || '');

export function kvToV21(list: unknown): V2Json[] {
  return (Array.isArray(list) ? (list as KeyValue[]) : [])
    .filter((kv) => kv && (kv.key || kv.value))
    .map((kv) => ({
      key: kv.key,
      value: kv.value ?? '',
      ...(kv.enabled === false ? { disabled: true } : {}),
      ...(kv.description ? { description: kv.description } : {}),
    }));
}

export function kvFromV2(list: unknown): KeyValue[] {
  return (Array.isArray(list) ? list : []).map((p: V2Json) => ({
    key: p.key ?? '',
    value: p.value == null ? '' : typeof p.value === 'string' ? p.value : JSON.stringify(p.value),
    enabled: !p.disabled,
    description: descriptionText(p.description),
  }));
}

export function parseHeaderBlock(text: string): KeyValue[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.includes(':'))
    .map((line) => {
      const i = line.indexOf(':');
      return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim(), enabled: true };
    });
}

export function parseQueryString(query: string): KeyValue[] {
  return query
    .split('&')
    .filter(Boolean)
    .map((pair) => {
      const i = pair.indexOf('=');
      return { key: i >= 0 ? pair.slice(0, i) : pair, value: i >= 0 ? pair.slice(i + 1) : '', enabled: true, description: '' };
    });
}
