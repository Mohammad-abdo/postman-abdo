"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.descriptionText = void 0;
exports.kvToV21 = kvToV21;
exports.kvFromV2 = kvFromV2;
exports.parseHeaderBlock = parseHeaderBlock;
exports.parseQueryString = parseQueryString;
const descriptionText = (d) => typeof d === 'object' && d ? String(d.content || '') : String(d || '');
exports.descriptionText = descriptionText;
function kvToV21(list) {
    return (Array.isArray(list) ? list : [])
        .filter((kv) => kv && (kv.key || kv.value))
        .map((kv) => ({
        key: kv.key,
        value: kv.value ?? '',
        ...(kv.enabled === false ? { disabled: true } : {}),
        ...(kv.description ? { description: kv.description } : {}),
    }));
}
function kvFromV2(list) {
    return (Array.isArray(list) ? list : []).map((p) => ({
        key: p.key ?? '',
        value: p.value == null ? '' : typeof p.value === 'string' ? p.value : JSON.stringify(p.value),
        enabled: !p.disabled,
        description: (0, exports.descriptionText)(p.description),
    }));
}
function parseHeaderBlock(text) {
    return text
        .split(/\r?\n/)
        .filter((line) => line.includes(':'))
        .map((line) => {
        const i = line.indexOf(':');
        return { key: line.slice(0, i).trim(), value: line.slice(i + 1).trim(), enabled: true };
    });
}
function parseQueryString(query) {
    return query
        .split('&')
        .filter(Boolean)
        .map((pair) => {
        const i = pair.indexOf('=');
        return { key: i >= 0 ? pair.slice(0, i) : pair, value: i >= 0 ? pair.slice(i + 1) : '', enabled: true, description: '' };
    });
}
