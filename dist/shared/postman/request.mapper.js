"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exampleToV21 = exampleToV21;
exports.requestToV21Item = requestToV21Item;
exports.requestFromV2Item = requestFromV2Item;
exports.exampleFromV2 = exampleFromV2;
const auth_mapper_1 = require("./auth.mapper");
const body_mapper_1 = require("./body.mapper");
const kv_mapper_1 = require("./kv.mapper");
const script_mapper_1 = require("./script.mapper");
const url_mapper_1 = require("./url.mapper");
function withoutEmpty(settings = {}) {
    return Object.fromEntries(Object.entries(settings).filter(([, v]) => v !== undefined && v !== null && v !== ''));
}
function exampleToV21(ex) {
    const orig = ex.request || {};
    return {
        id: ex.id,
        name: ex.name,
        originalRequest: {
            method: orig.method || 'GET',
            header: (0, kv_mapper_1.kvToV21)(orig.headers),
            url: (0, url_mapper_1.urlToV21)(orig.url || '', orig.params, orig.pathVariables),
            ...(orig.body ? { body: (0, body_mapper_1.bodyToV21)(orig.body) } : {}),
        },
        status: ex.status,
        code: ex.code,
        _postman_previewlanguage: ex.language || 'json',
        header: (0, kv_mapper_1.kvToV21)(ex.headers),
        cookie: [],
        body: ex.body || '',
    };
}
function requestToV21Item(r, opts = {}) {
    const item = {
        id: r.id,
        name: r.name,
        request: {
            method: (r.method || 'GET').toUpperCase(),
            header: (0, kv_mapper_1.kvToV21)(r.headers),
            url: (0, url_mapper_1.urlToV21)(r.url || '', r.params, r.pathVariables),
        },
        response: (r.examples || []).map(exampleToV21),
    };
    const body = (0, body_mapper_1.bodyToV21)(r.body, opts.forRun);
    if (body)
        item.request.body = body;
    const auth = (0, auth_mapper_1.authToV21)(r.auth);
    if (auth)
        item.request.auth = auth;
    if (r.description)
        item.request.description = r.description;
    const events = (0, script_mapper_1.scriptsToEvents)(r.preRequestScript, r.testScript);
    if (events.length)
        item.event = events;
    const settings = withoutEmpty(r.settings);
    if (Object.keys(settings).length)
        item.protocolProfileBehavior = settings;
    return item;
}
function requestFromV2Item(item) {
    const r = typeof item.request === 'string' ? { url: item.request, method: 'GET' } : item.request || {};
    const url = (0, url_mapper_1.urlFromV2)(r.url);
    const scripts = (0, script_mapper_1.scriptsFromEvents)(item.event);
    return {
        type: 'http',
        name: item.name || url.raw || 'Untitled Request',
        method: (r.method || 'GET').toUpperCase(),
        url: url.raw,
        params: url.params,
        pathVariables: url.pathVariables,
        headers: typeof r.header === 'string' ? (0, kv_mapper_1.parseHeaderBlock)(r.header) : (0, kv_mapper_1.kvFromV2)(r.header),
        body: (0, body_mapper_1.bodyFromV2)(r.body),
        auth: (0, auth_mapper_1.authFromV2)(r.auth),
        preRequestScript: scripts.pre,
        testScript: scripts.test,
        settings: item.protocolProfileBehavior || {},
        description: (0, kv_mapper_1.descriptionText)(r.description) || (0, kv_mapper_1.descriptionText)(item.description),
    };
}
function exampleFromV2(resp, index) {
    const orig = resp.originalRequest ? requestFromV2Item({ request: resp.originalRequest }) : null;
    return {
        name: resp.name || `Example ${index + 1}`,
        request: orig && {
            method: orig.method,
            url: orig.url,
            params: orig.params,
            pathVariables: orig.pathVariables,
            headers: orig.headers,
            body: orig.body,
        },
        code: Number(resp.code) || 200,
        status: resp.status || 'OK',
        headers: (0, kv_mapper_1.kvFromV2)(resp.header || []),
        body: typeof resp.body === 'string' ? resp.body : resp.body == null ? '' : JSON.stringify(resp.body, null, 2),
        language: resp._postman_previewlanguage || 'json',
        sortOrder: index,
    };
}
