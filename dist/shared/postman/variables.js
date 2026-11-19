"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.effectiveValue = void 0;
exports.variablesToV21 = variablesToV21;
exports.variablesFromV2 = variablesFromV2;
exports.scopeValues = scopeValues;
exports.mergeScope = mergeScope;
const kv_mapper_1 = require("./kv.mapper");
const hasCurrent = (v) => v.currentValue !== undefined && v.currentValue !== null && v.currentValue !== '';
/** Postman semantics: the current value wins over the initial value when set. */
const effectiveValue = (v) => (hasCurrent(v) ? v.currentValue : v.value ?? '');
exports.effectiveValue = effectiveValue;
const stringify = (value) => (typeof value === 'string' ? value : JSON.stringify(value));
function variablesToV21(vars, useCurrentValues = false) {
    return (Array.isArray(vars) ? vars : [])
        .filter((v) => v && v.key)
        .map((v) => ({
        key: v.key,
        value: useCurrentValues ? (0, exports.effectiveValue)(v) : v.value ?? '',
        type: v.type === 'secret' ? 'secret' : 'string',
        ...(v.enabled === false ? { disabled: true } : {}),
        ...(v.description ? { description: v.description } : {}),
    }));
}
function variablesFromV2(vars) {
    return (Array.isArray(vars) ? vars : []).map((v) => ({
        key: v.key || v.id || '',
        value: v.value == null ? '' : stringify(v.value),
        currentValue: '',
        type: v.type === 'secret' ? 'secret' : 'default',
        enabled: !v.disabled && v.enabled !== false,
        description: (0, kv_mapper_1.descriptionText)(v.description),
    }));
}
/** Enabled variables as `{key, value}` pairs for the runtime. */
function scopeValues(vars) {
    return (Array.isArray(vars) ? vars : [])
        .filter((v) => v && v.key && v.enabled !== false)
        .map((v) => ({ key: v.key, value: (0, exports.effectiveValue)(v), type: v.type === 'secret' ? 'secret' : 'any' }));
}
/**
 * Merges values coming back from script execution into a stored variable list.
 * Like Postman, script writes update the *current* value, unset keys disappear and new keys are appended.
 */
function mergeScope(stored, updated) {
    const list = Array.isArray(stored) ? stored : [];
    const byKey = new Map(updated.map((u) => [u.key, stringify(u.value)]));
    const result = [];
    list.forEach((v) => {
        if (v.enabled === false)
            return result.push(v);
        if (!byKey.has(v.key))
            return;
        const value = byKey.get(v.key);
        result.push(value === (0, exports.effectiveValue)(v) ? v : { ...v, currentValue: value });
    });
    byKey.forEach((value, key) => {
        if (!list.some((v) => v.key === key))
            result.push({ key, value: '', currentValue: value, type: 'default', enabled: true });
    });
    return result;
}
