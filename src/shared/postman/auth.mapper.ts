import { AuthModel, V2Json } from './types';

const isInherited = (auth?: AuthModel | null) => !auth || !auth.type || auth.type === 'inherit';

/** `{type:'bearer', bearer:{token}}` → `{type:'bearer', bearer:[{key:'token', value}]}`; inherit → undefined. */
export function authToV21(auth?: AuthModel | null): V2Json | undefined {
  if (isInherited(auth)) return undefined;
  if (auth!.type === 'noauth') return { type: 'noauth' };
  const params: Record<string, unknown> = auth![auth!.type] || {};
  return {
    type: auth!.type,
    [auth!.type]: Object.entries(params).map(([key, value]) => ({
      key,
      value,
      type: typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'any' : 'string',
    })),
  };
}

/** Accepts both v2.1 (array params) and v2.0 (object params) auth. */
export function authFromV2(auth: V2Json): AuthModel {
  if (!auth || !auth.type) return { type: 'inherit' };
  if (auth.type === 'noauth') return { type: 'noauth' };
  const raw = auth[auth.type];
  const params: Record<string, unknown> = {};
  if (Array.isArray(raw)) raw.forEach((p: V2Json) => (params[p.key] = p.value));
  else if (raw && typeof raw === 'object') Object.assign(params, raw);
  return { type: auth.type, [auth.type]: params };
}

export { isInherited as isInheritedAuth };
