import { descriptionText } from './kv.mapper';
import { V2Json, Variable } from './types';

export interface ScopeValue {
  key: string;
  value: unknown;
  type?: string;
}

const hasCurrent = (v: Variable) => v.currentValue !== undefined && v.currentValue !== null && v.currentValue !== '';

/** Postman semantics: the current value wins over the initial value when set. */
export const effectiveValue = (v: Variable) => (hasCurrent(v) ? v.currentValue! : v.value ?? '');

const stringify = (value: unknown) => (typeof value === 'string' ? value : JSON.stringify(value));

export function variablesToV21(vars: unknown, useCurrentValues = false): V2Json[] {
  return (Array.isArray(vars) ? (vars as Variable[]) : [])
    .filter((v) => v && v.key)
    .map((v) => ({
      key: v.key,
      value: useCurrentValues ? effectiveValue(v) : v.value ?? '',
      type: v.type === 'secret' ? 'secret' : 'string',
      ...(v.enabled === false ? { disabled: true } : {}),
      ...(v.description ? { description: v.description } : {}),
    }));
}

export function variablesFromV2(vars: unknown): Variable[] {
  return (Array.isArray(vars) ? vars : []).map((v: V2Json) => ({
    key: v.key || v.id || '',
    value: v.value == null ? '' : stringify(v.value),
    currentValue: '',
    type: v.type === 'secret' ? 'secret' : 'default',
    enabled: !v.disabled && v.enabled !== false,
    description: descriptionText(v.description),
  }));
}

/** Enabled variables as `{key, value}` pairs for the runtime. */
export function scopeValues(vars: unknown): ScopeValue[] {
  return (Array.isArray(vars) ? (vars as Variable[]) : [])
    .filter((v) => v && v.key && v.enabled !== false)
    .map((v) => ({ key: v.key, value: effectiveValue(v), type: v.type === 'secret' ? 'secret' : 'any' }));
}

/**
 * Merges values coming back from script execution into a stored variable list.
 * Like Postman, script writes update the *current* value, unset keys disappear and new keys are appended.
 */
export function mergeScope(stored: unknown, updated: ScopeValue[]): Variable[] {
  const list: Variable[] = Array.isArray(stored) ? (stored as Variable[]) : [];
  const byKey = new Map(updated.map((u) => [u.key, stringify(u.value)]));
  const result: Variable[] = [];

  list.forEach((v) => {
    if (v.enabled === false) return result.push(v);
    if (!byKey.has(v.key)) return;
    const value = byKey.get(v.key)!;
    result.push(value === effectiveValue(v) ? v : { ...v, currentValue: value });
  });
  byKey.forEach((value, key) => {
    if (!list.some((v) => v.key === key)) result.push({ key, value: '', currentValue: value, type: 'default', enabled: true });
  });
  return result;
}
