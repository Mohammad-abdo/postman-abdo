"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isInheritedAuth = void 0;
exports.authToV21 = authToV21;
exports.authFromV2 = authFromV2;
const isInherited = (auth) => !auth || !auth.type || auth.type === 'inherit';
exports.isInheritedAuth = isInherited;
/** `{type:'bearer', bearer:{token}}` → `{type:'bearer', bearer:[{key:'token', value}]}`; inherit → undefined. */
function authToV21(auth) {
    if (isInherited(auth))
        return undefined;
    if (auth.type === 'noauth')
        return { type: 'noauth' };
    const params = auth[auth.type] || {};
    return {
        type: auth.type,
        [auth.type]: Object.entries(params).map(([key, value]) => ({
            key,
            value,
            type: typeof value === 'boolean' ? 'boolean' : typeof value === 'object' ? 'any' : 'string',
        })),
    };
}
/** Accepts both v2.1 (array params) and v2.0 (object params) auth. */
function authFromV2(auth) {
    if (!auth || !auth.type)
        return { type: 'inherit' };
    if (auth.type === 'noauth')
        return { type: 'noauth' };
    const raw = auth[auth.type];
    const params = {};
    if (Array.isArray(raw))
        raw.forEach((p) => (params[p.key] = p.value));
    else if (raw && typeof raw === 'object')
        Object.assign(params, raw);
    return { type: auth.type, [auth.type]: params };
}
