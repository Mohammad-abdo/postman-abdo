"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.pathVariablesFromRaw = pathVariablesFromRaw;
exports.urlToV21 = urlToV21;
exports.urlFromV2 = urlFromV2;
const kv_mapper_1 = require("./kv.mapper");
/** `/users/:id` → [{key:'id'}], keeping values already known. */
function pathVariablesFromRaw(raw, known = []) {
    const pathOnly = raw.split('?')[0];
    return Array.from(pathOnly.matchAll(/\/:([A-Za-z0-9_\-.]+)/g)).map(([, name]) => known.find((k) => k.key === name) || { key: name, value: '', description: '' });
}
function queryFromRaw(raw) {
    const q = raw.indexOf('?');
    return q >= 0 ? (0, kv_mapper_1.parseQueryString)(raw.slice(q + 1).split('#')[0]) : [];
}
/** Splits a raw URL into the v2.1 url object, keeping our param metadata (disabled flags, descriptions). */
function urlToV21(raw, params, pathVariables) {
    const url = { raw: raw || '' };
    let rest = raw || '';
    const hashIdx = rest.indexOf('#');
    if (hashIdx >= 0) {
        url.hash = rest.slice(hashIdx + 1);
        rest = rest.slice(0, hashIdx);
    }
    const qIdx = rest.indexOf('?');
    if (qIdx >= 0)
        rest = rest.slice(0, qIdx);
    const protocol = rest.match(/^([a-zA-Z][\w+.-]*):\/\//);
    if (protocol) {
        url.protocol = protocol[1];
        rest = rest.slice(protocol[0].length);
    }
    const slash = rest.indexOf('/');
    let host = slash >= 0 ? rest.slice(0, slash) : rest;
    const port = host.match(/^(.+):(\d+|\{\{[^}]+\}\})$/);
    if (port) {
        url.port = port[2];
        host = port[1];
    }
    url.host = host ? host.split('.') : [];
    url.path = slash >= 0 ? rest.slice(slash + 1).split('/') : [];
    const query = (0, kv_mapper_1.kvToV21)(params && params.length ? params : queryFromRaw(raw || ''));
    if (query.length)
        url.query = query;
    const variables = (pathVariables || [])
        .filter((v) => v && v.key)
        .map((v) => ({ key: v.key, value: v.value ?? '', ...(v.description ? { description: v.description } : {}) }));
    if (variables.length)
        url.variable = variables;
    return url;
}
function urlFromV2(url) {
    if (!url)
        return { raw: '', params: [], pathVariables: [] };
    if (typeof url === 'string')
        return { raw: url, params: queryFromRaw(url), pathVariables: pathVariablesFromRaw(url) };
    let raw = url.raw;
    if (!raw) {
        const host = Array.isArray(url.host) ? url.host.join('.') : url.host || '';
        const p = Array.isArray(url.path) ? url.path.join('/') : url.path || '';
        raw = `${url.protocol ? url.protocol + '://' : ''}${host}${url.port ? ':' + url.port : ''}${p ? '/' + p : ''}`;
        const enabled = (url.query || []).filter((q) => !q.disabled);
        if (enabled.length)
            raw += '?' + enabled.map((q) => (q.value == null ? q.key : `${q.key}=${q.value}`)).join('&');
    }
    const known = (0, kv_mapper_1.kvFromV2)(url.variable).map(({ enabled: _enabled, ...v }) => v);
    return { raw, params: (0, kv_mapper_1.kvFromV2)(url.query), pathVariables: pathVariablesFromRaw(raw, known) };
}
