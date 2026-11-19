"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.inferSchema = inferSchema;
exports.mergeSchemas = mergeSchemas;
exports.validateAgainst = validateAgainst;
exports.buildContract = buildContract;
exports.diffContracts = diffContracts;
const util_1 = require("./util");
const FORMATS = [
    ['email', /^[^\s@]+@[^\s@]+\.[^\s@]+$/],
    ['uuid', /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i],
    ['date-time', /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/],
    ['date', /^\d{4}-\d{2}-\d{2}$/],
    ['uri', /^https?:\/\/\S+$/i],
];
const MISSING = () => ({ type: 'unknown', status: 'missing', seenIn: 0 });
/** Infers a schema candidate from ONE value. Everything it returns is `inferred`. */
function inferSchema(value, depth = 0) {
    if (value === null)
        return { type: 'null', status: 'inferred', seenIn: 1, nullable: true };
    if (typeof value === 'boolean')
        return { type: 'boolean', status: 'inferred', seenIn: 1, example: value };
    if (typeof value === 'number')
        return { type: Number.isInteger(value) ? 'integer' : 'number', status: 'inferred', seenIn: 1, example: value };
    if (typeof value === 'string') {
        const format = FORMATS.find(([, re]) => re.test(value))?.[0];
        return { type: 'string', ...(format ? { format } : {}), status: 'inferred', seenIn: 1, example: value.length > 200 ? value.slice(0, 200) : value };
    }
    if (Array.isArray(value)) {
        if (depth > 12)
            return { type: 'array', status: 'inferred', seenIn: 1 };
        const items = value.map((v) => inferSchema(v, depth + 1)).reduce((acc, n) => (acc ? mergeSchemas(acc, n) : n), null);
        return { type: 'array', items: items || MISSING(), status: 'inferred', seenIn: 1 };
    }
    if ((0, util_1.isObj)(value)) {
        const properties = {};
        if (depth <= 12)
            Object.entries(value).forEach(([k, v]) => (properties[k] = inferSchema(v, depth + 1)));
        return { type: 'object', properties, status: 'inferred', seenIn: 1, requiredCandidates: Object.keys(properties) };
    }
    return MISSING();
}
/** Merges two observations of the same field. Differences widen the schema; they never narrow it. */
function mergeSchemas(a, b) {
    if (a.type === 'unknown' && a.status === 'missing')
        return b;
    if (b.type === 'unknown' && b.status === 'missing')
        return a;
    const seenIn = a.seenIn + b.seenIn;
    if (a.type === 'null' || b.type === 'null') {
        const real = a.type === 'null' ? b : a;
        return { ...real, nullable: true, seenIn };
    }
    const numeric = (t) => t === 'integer' || t === 'number';
    if (a.type !== b.type) {
        if (numeric(a.type) && numeric(b.type))
            return { ...a, type: 'number', seenIn };
        return { type: 'unknown', status: 'inferred', seenIn, nullable: a.nullable || b.nullable }; // inconsistent types
    }
    const merged = { ...a, seenIn, nullable: a.nullable || b.nullable || undefined };
    if (a.format !== b.format)
        delete merged.format;
    if (a.type === 'object') {
        const props = {};
        const keys = new Set([...Object.keys(a.properties || {}), ...Object.keys(b.properties || {})]);
        keys.forEach((k) => {
            const pa = a.properties?.[k];
            const pb = b.properties?.[k];
            props[k] = pa && pb ? mergeSchemas(pa, pb) : (pa || pb);
        });
        merged.properties = props;
        const reqA = new Set(a.requiredCandidates || []);
        merged.requiredCandidates = (b.requiredCandidates || []).filter((k) => reqA.has(k));
    }
    if (a.type === 'array')
        merged.items = a.items && b.items ? mergeSchemas(a.items, b.items) : a.items || b.items;
    return merged;
}
/**
 * Validates a value against a schema. Inferred schemas are validated leniently:
 * every mismatch is a `warning`, never an `error`. Only `confirmed` nodes can produce errors.
 */
function validateAgainst(schema, value, path = '$') {
    if (schema.status === 'missing' || schema.type === 'unknown')
        return [];
    const sev = schema.status === 'confirmed' ? 'error' : 'warning';
    if (value === null)
        return schema.nullable || schema.type === 'null' ? [] : [{ path, message: `expected ${schema.type}, got null`, severity: sev }];
    const actual = Array.isArray(value) ? 'array' : typeof value === 'number' ? (Number.isInteger(value) ? 'integer' : 'number') : typeof value;
    const okType = schema.type === actual || (schema.type === 'number' && actual === 'integer');
    if (!okType)
        return [{ path, message: `expected ${schema.type}, got ${actual}`, severity: sev }];
    const issues = [];
    if (schema.type === 'object' && schema.properties && (0, util_1.isObj)(value)) {
        Object.entries(schema.properties).forEach(([k, node]) => {
            if (k in value)
                issues.push(...validateAgainst(node, value[k], `${path}.${k}`));
            else if (schema.requiredCandidates?.includes(k) && schema.seenIn >= 2)
                issues.push({ path: `${path}.${k}`, message: 'missing (present in every example)', severity: 'warning' });
        });
    }
    if (schema.type === 'array' && schema.items && Array.isArray(value))
        value.slice(0, 20).forEach((v, i) => issues.push(...validateAgainst(schema.items, v, `${path}[${i}]`)));
    return issues;
}
function buildContract(model) {
    const endpoints = {};
    for (const e of model.endpoints) {
        const responses = {};
        const byCode = new Map();
        e.examples.forEach((ex) => {
            if (ex.body === undefined)
                return;
            byCode.set(ex.code, [...(byCode.get(ex.code) || []), inferSchema(ex.body)]);
        });
        e.examples.forEach((ex) => {
            const k = String(ex.code);
            if (!responses[k])
                responses[k] = { schema: MISSING(), exampleCount: 0, status: 'missing' };
            responses[k].exampleCount++;
        });
        byCode.forEach((schemas, code) => {
            const merged = schemas.reduce((acc, n) => mergeSchemas(acc, n));
            responses[String(code)] = { ...responses[String(code)], schema: merged, status: 'inferred' };
        });
        endpoints[e.key] = {
            key: e.key,
            requestId: e.id,
            auth: { type: e.auth.type },
            request: {
                pathParams: e.pathParams,
                query: e.query,
                headers: e.headers.filter((h) => !/^authorization$/i.test(h.name)).map((h) => ({ ...h, example: undefined })), // never keep credential-looking values
                body: e.body.example !== undefined ? inferSchema(e.body.example) : undefined,
            },
            responses,
        };
    }
    const body = { sourceHash: model.meta.sourceHash, endpoints };
    return { version: (0, util_1.hashOf)(body).slice(0, 16), ...body };
}
/** Typed diff between two contracts (used by the impact report). */
function diffContracts(a, b) {
    const changes = [];
    const ka = new Set(Object.keys(a.endpoints));
    const kb = new Set(Object.keys(b.endpoints));
    kb.forEach((k) => !ka.has(k) && changes.push({ type: 'endpoint.added', endpoint: k }));
    ka.forEach((k) => !kb.has(k) && changes.push({ type: 'endpoint.removed', endpoint: k }));
    ka.forEach((k) => {
        if (!kb.has(k))
            return;
        const x = a.endpoints[k];
        const y = b.endpoints[k];
        if (x.auth.type !== y.auth.type)
            changes.push({ type: 'auth.changed', endpoint: k, detail: `${x.auth.type} → ${y.auth.type}` });
        const names = (l) => new Set(l.map((p) => p.name));
        ['pathParams', 'query'].forEach((part) => {
            const pa = names(x.request[part]);
            const pb = names(y.request[part]);
            pb.forEach((n) => !pa.has(n) && changes.push({ type: 'param.added', endpoint: k, detail: n }));
            pa.forEach((n) => !pb.has(n) && changes.push({ type: 'param.removed', endpoint: k, detail: n }));
        });
        if ((0, util_1.hashOf)(x.request.body) !== (0, util_1.hashOf)(y.request.body))
            changes.push({ type: 'request.body.changed', endpoint: k });
        Object.keys({ ...x.responses, ...y.responses }).forEach((code) => {
            if (!x.responses[code])
                changes.push({ type: 'response.added', endpoint: k, detail: code });
            else if (!y.responses[code])
                changes.push({ type: 'response.removed', endpoint: k, detail: code });
            else if ((0, util_1.hashOf)(x.responses[code].schema) !== (0, util_1.hashOf)(y.responses[code].schema))
                changes.push({ type: 'response.changed', endpoint: k, detail: code });
        });
    });
    return changes;
}
