"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isObj = exports.parseBody = exports.redactHeaders = exports.DEFAULT_COMPARE_RULES = exports.isSafeMethod = void 0;
exports.hostAllowed = hostAllowed;
exports.gateRequest = gateRequest;
exports.buildRealRequest = buildRealRequest;
exports.diffBodies = diffBodies;
exports.compareResponses = compareResponses;
const contract_1 = require("./contract");
const util_1 = require("./util");
Object.defineProperty(exports, "isObj", { enumerable: true, get: function () { return util_1.isObj; } });
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const isSafeMethod = (m) => SAFE_METHODS.has(m.toUpperCase());
exports.isSafeMethod = isSafeMethod;
function hostAllowed(hostname, allowed = []) {
    const h = hostname.toLowerCase().replace(/\.$/, '');
    return allowed.some((raw) => {
        const a = raw.trim().toLowerCase();
        if (!a)
            return false;
        if (a.startsWith('.'))
            return h.endsWith(a) && h.length > a.length;
        if (a.startsWith('*.'))
            return h.endsWith(a.slice(1)) && h.length > a.length - 1;
        return h === a;
    });
}
function gateRequest(args) {
    const { settings } = args;
    if (!settings.enabled)
        return { ok: false, reason: 'Real API mode is not enabled for this test app' };
    if (!settings.allowedHosts?.length)
        return { ok: false, reason: 'Add at least one allowed host before using Real API mode' };
    let u;
    try {
        u = new URL(args.url);
    }
    catch {
        return { ok: false, reason: 'The request URL is not valid (unresolved variable?)' };
    }
    if (u.protocol !== 'http:' && u.protocol !== 'https:')
        return { ok: false, reason: 'Only http(s) URLs can be called' };
    if (u.username || u.password)
        return { ok: false, reason: 'URLs with embedded credentials are not allowed' };
    if (!hostAllowed(u.hostname, settings.allowedHosts))
        return { ok: false, reason: `Host ${u.hostname} is not in the allowlist` };
    if (!(0, exports.isSafeMethod)(args.method)) {
        if (!settings.allowUnsafe)
            return { ok: false, reason: `${args.method} changes data; enable "allow state-changing requests" first` };
        if (!args.confirmUnsafe)
            return { ok: false, reason: `${args.method} changes data; this run must be explicitly confirmed` };
        if (args.environmentStage === 'production') {
            if (!args.isWorkspaceAdmin)
                return { ok: false, reason: 'Only workspace admins can send state-changing requests to a production environment' };
            if (!args.confirmProduction)
                return { ok: false, reason: 'Production environment: confirm explicitly to send a state-changing request' };
        }
    }
    return { ok: true };
}
/** Builds the real URL for an endpoint from UI/test values. `resolve` maps `{{var}}` to its value. */
function buildRealRequest(e, values, settings, resolve) {
    const missing = [];
    const path = e.path
        .split('/')
        .map((seg) => {
        const m = /^\{(.+)\}$/.exec(seg);
        if (!m)
            return seg;
        const v = values.pathParams?.[m[1]] ?? e.pathParams.find((p) => p.name === m[1])?.example;
        if (v === undefined || v === '') {
            missing.push(m[1]);
            return seg;
        }
        return encodeURIComponent(String(v));
    })
        .join('/');
    let origin = settings.baseUrl?.replace(/\/+$/, '') || '';
    if (!origin) {
        const host = e.host || '';
        origin = host.replace(/\{\{\s*([^{}\s]+)\s*\}\}/g, (_x, name) => resolve(name) ?? `{{${name}}}`);
        if (origin && !/^https?:\/\//i.test(origin))
            origin = `https://${origin}`;
    }
    const query = {};
    e.query.forEach((q) => q.example !== undefined && q.example !== '' && (query[q.name] = q.example));
    Object.entries(values.query || {}).forEach(([k, v]) => v !== '' && (query[k] = String(v)));
    const qs = new URLSearchParams(values.queryEntries ?? query).toString();
    const url = `${origin}${path}${qs ? `?${qs}` : ''}`;
    if (/\{\{/.test(origin))
        missing.push('base URL variable');
    return { method: e.method, url, query, body: values.body ?? e.body.example, missing };
}
exports.DEFAULT_COMPARE_RULES = {
    ignoreValueKeys: /(^|_|\b)(id|uuid|token|accesstoken|refreshtoken|jwt|created|updated|deleted|expires|timestamp|date|time|etag|nonce|cursor|url|href)s?$|at$/i,
    ignoreArrayOrder: true,
};
const typeOf = (v) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v === 'number' ? (Number.isInteger(v) ? 'integer' : 'number') : typeof v);
const numeric = (t) => t === 'integer' || t === 'number';
function diffBodies(mock, real, rules = exports.DEFAULT_COMPARE_RULES, path = '$', key = '', depth = 0) {
    if (depth > 10)
        return [];
    const tm = typeOf(mock);
    const tr = typeOf(real);
    if (tm === 'null' || tr === 'null')
        return tm === tr ? [] : [{ path, kind: 'type-mismatch', mock, real, class: 'structural' }]; // nullability is reported, not guessed
    if (tm !== tr && !(numeric(tm) && numeric(tr)))
        return [{ path, kind: 'type-mismatch', mock: tm, real: tr, class: 'structural' }];
    if (tm === 'array') {
        const a = mock;
        const b = real;
        if (a.length && !b.length)
            return [{ path, kind: 'empty-in-real', mock: `${a.length} items`, real: 'empty', class: 'structural' }];
        if (!a.length || !b.length)
            return [];
        return diffBodies(a[0], b[0], rules, `${path}[0]`, key, depth + 1);
    }
    if (tm === 'object') {
        const a = mock;
        const b = real;
        const out = [];
        for (const k of Object.keys(a)) {
            if (!(k in b))
                out.push({ path: `${path}.${k}`, kind: 'missing-in-real', mock: a[k] === null || typeof a[k] !== 'object' ? a[k] : typeof a[k], class: 'structural' });
            else
                out.push(...diffBodies(a[k], b[k], rules, `${path}.${k}`, k, depth + 1));
        }
        for (const k of Object.keys(b))
            if (!(k in a))
                out.push({ path: `${path}.${k}`, kind: 'extra-in-real', real: typeof b[k] === 'object' ? typeof b[k] : b[k], class: 'structural' });
        return out;
    }
    if (mock !== real && key)
        return [{ path, kind: 'value-differs', mock, real, class: rules.ignoreValueKeys.test(key) ? 'dynamic' : 'value' }];
    return [];
}
/**
 * Mock vs real. Only a status code outside the DOCUMENTED example codes is a hard failure (documented fact).
 * Structure differences are measured against example-derived schemas, so they are warnings (inferred), never failures.
 * Dynamic fields (ids, timestamps, tokens) are reported separately and do not affect the verdict.
 */
function compareResponses(args) {
    const { mock, real, documentedCodes } = args;
    const diffs = diffBodies(mock.body, real.body, args.rules);
    // Mock data is synthetic, so VALUES always differ; only structural differences affect the verdict.
    const significant = diffs.filter((d) => d.kind !== 'value-differs');
    const statusOk = documentedCodes.length === 0 ? real.status === mock.status : documentedCodes.includes(real.status);
    const problems = [];
    if (!statusOk)
        problems.push(`real status ${real.status} is not documented (${documentedCodes.join(', ') || mock.status})`);
    significant.slice(0, 8).forEach((d) => problems.push(`${d.path}: ${d.kind}`));
    const contractSchema = args.contract?.responses[String(real.status)]?.schema;
    const contractIssues = contractSchema ? (0, contract_1.validateAgainst)(contractSchema, real.body).length : 0;
    if (contractIssues)
        problems.push(`${contractIssues} difference(s) from the example-derived schema`);
    return {
        status: !statusOk ? 'failed' : significant.length || contractIssues ? 'warning' : 'passed',
        expected: `status in [${documentedCodes.join(', ') || mock.status}] and the example structure`,
        actual: `status ${real.status}; ${significant.length} structural difference(s), ${diffs.length - significant.length} value difference(s) ignored`,
        error: problems.join('; ') || undefined,
        diffs,
        certainty: !statusOk ? 'verified' : 'inferred',
    };
}
const redactHeaders = (h) => Object.fromEntries(Object.entries(h).filter(([k]) => !/^(set-cookie|authorization|proxy-authenticate|www-authenticate|cookie|x-api-key)$/i.test(k)));
exports.redactHeaders = redactHeaders;
const parseBody = (text) => {
    if (!text)
        return '';
    try {
        return JSON.parse(text);
    }
    catch {
        return text.length > 2000 ? `${text.slice(0, 2000)}…` : text;
    }
};
exports.parseBody = parseBody;
