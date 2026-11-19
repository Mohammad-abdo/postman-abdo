"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.realSettingsOf = exports.REAL_LIMITS = void 0;
exports.loadRealContext = loadRealContext;
exports.assertRealEnabled = assertRealEnabled;
exports.executeReal = executeReal;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const security_middleware_1 = require("../../core/security/security.middleware");
const request_mapper_1 = require("../../shared/postman/request.mapper");
const variables_1 = require("../../shared/postman/variables");
const real_1 = require("../../shared/testapp/real");
const util_1 = require("../../shared/testapp/util");
const collection_service_1 = require("../collections/collection.service");
const runtime_adapter_1 = require("../execution/runtime/runtime.adapter");
const variable_scopes_1 = require("../execution/variable-scopes");
const limits_service_1 = require("../platform/limits.service");
const workspace_access_1 = require("../workspaces/workspace.access");
exports.REAL_LIMITS = { timeoutMs: 15_000, maxResponseMb: 2, maxEndpointsPerRun: 40, runBudgetMs: 120_000, maxBodyChars: 256 * 1024 };
const realSettingsOf = (app) => {
    const s = ((0, util_1.isObj)(app.settings) ? app.settings : {});
    return s.real || {};
};
exports.realSettingsOf = realSettingsOf;
async function loadRealContext(userId, app) {
    const settings = (0, exports.realSettingsOf)(app);
    const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, app.workspaceId);
    if (member.role === 'viewer')
        throw (0, http_error_1.Forbidden)('Viewers cannot run Real API tests');
    const scopes = await (0, variable_scopes_1.loadScopes)(app.workspaceId, settings.environmentId);
    const collection = await collection_service_1.collectionService.toPostman(app.collectionId, { forRun: true, useCurrentValues: true });
    const vars = new Map();
    [scopes.globals.variables, collection.variable, scopes.environment?.variables].forEach((list) => (0, variables_1.scopeValues)(list).forEach((v) => vars.set(v.key, String(v.value))));
    return { scopes, vars, collection, environmentStage: scopes.environment?.stage || null, isAdmin: member.role === 'admin' };
}
function assertRealEnabled(app) {
    const s = (0, exports.realSettingsOf)(app);
    if (!s.enabled || !s.allowedHosts?.length)
        throw (0, http_error_1.BadRequest)('Enable Real API mode and add at least one allowed host in the test app settings first.');
}
/**
 * Executes ONE endpoint against the real backend through the existing postman-runtime executor.
 * Safeguards, all enforced here: host allowlist, SSRF address block (always on), method gating, production block,
 * no redirects, scripts off unless enabled, timeout, response-size cap, daily request quota.
 * Never reachable from public share links.
 */
function folderAuth(items, requestId, inherited) {
    for (const item of items) {
        if (item.id === requestId && item.request)
            return inherited;
        if (Array.isArray(item.item)) {
            const auth = folderAuth(item.item, requestId, item.auth ?? inherited);
            if (auth !== undefined)
                return auth;
        }
    }
    return undefined;
}
async function executeReal(args) {
    const { app, endpoint } = args;
    const settings = (0, exports.realSettingsOf)(app);
    const ctx = args.context || (await loadRealContext(args.userId, app));
    const built = (0, real_1.buildRealRequest)(endpoint, args.values || {}, settings, (n) => ctx.vars.get(n));
    if (built.missing.length)
        return { kind: 'skipped', reason: `No value for ${built.missing.join(', ')} (add an example value in the collection)` };
    const gate = (0, real_1.gateRequest)({ method: built.method, url: built.url, settings, confirmUnsafe: args.confirmUnsafe, confirmProduction: args.confirmProduction, environmentStage: ctx.environmentStage, isWorkspaceAdmin: ctx.isAdmin });
    if (!gate.ok)
        return { kind: 'blocked', reason: gate.reason };
    const row = await prisma_1.prisma.request.findUnique({ where: { id: endpoint.id } });
    if (!row || row.collectionId !== app.collectionId)
        return { kind: 'skipped', reason: 'The request no longer exists in the collection' };
    await limits_service_1.limitsService.consumeRequests(args.userId, 1);
    const item = (0, request_mapper_1.requestToV21Item)({ ...row, examples: [] }, { forRun: true });
    const inheritedAuth = folderAuth(ctx.collection.item || [], item.id);
    if (!item.request.auth && inheritedAuth !== undefined)
        item.request.auth = inheritedAuth;
    item.request.url = built.url; // string form: postman-runtime parses it itself
    const hasJsonBody = (0, util_1.isObj)(built.body) && built.method !== 'GET' && built.method !== 'HEAD';
    if (hasJsonBody && (!item.request.body || item.request.body.mode === 'raw')) {
        item.request.body = { mode: 'raw', raw: JSON.stringify(built.body), options: { raw: { language: 'json' } } };
        const headers = item.request.header || (item.request.header = []);
        if (!headers.some((h) => /^content-type$/i.test(h.key)))
            headers.push({ key: 'Content-Type', value: 'application/json' });
    }
    if (args.values?.rawBody && item.request.body?.mode === 'raw') {
        item.request.body.raw = String(args.values.body ?? '');
    }
    const form = args.values?.form;
    const requestBody = item.request.body;
    if (form && requestBody?.mode === 'urlencoded') {
        for (const field of requestBody.urlencoded || []) {
            if (Object.hasOwn(form, field.key))
                field.value = String(form[field.key]);
        }
    }
    if (form && requestBody?.mode === 'formdata') {
        for (const field of requestBody.formdata || []) {
            if (field.type !== 'file' && Object.hasOwn(form, field.key))
                field.value = String(form[field.key]);
        }
    }
    for (const [name, value] of Object.entries(args.values?.headers || {})) {
        if (/^(host|:|connection|content-length|transfer-encoding|upgrade|proxy-)/i.test(name))
            continue;
        const headers = item.request.header || (item.request.header = []);
        const existing = headers.find((header) => header.key.toLowerCase() === name.toLowerCase());
        if (existing)
            existing.value = value;
        else
            headers.push({ key: name, value });
    }
    if (!settings.runScripts)
        delete item.event;
    const collection = { ...ctx.collection, item: [item] };
    if (!settings.runScripts)
        delete collection.event;
    const result = await (0, runtime_adapter_1.runCollection)({
        collection,
        entrypoint: item.id,
        ...(0, variable_scopes_1.runtimeValues)(ctx.scopes),
        settings: {
            restrictedAddresses: security_middleware_1.PRIVATE_NETWORKS, // always on for this feature, regardless of BLOCK_PRIVATE_NETWORKS
            timeout: exports.REAL_LIMITS.timeoutMs,
            maxResponseSize: exports.REAL_LIMITS.maxResponseMb,
            strictSSL: true,
            followRedirects: false, // a redirect could leave the allowlist
            disableCookies: true,
        },
    });
    const execution = result.executions[0];
    if (!execution?.response)
        return { kind: 'error', reason: execution?.error || result.error || 'No response received' };
    const text = String(execution.response.body || '').slice(0, exports.REAL_LIMITS.maxBodyChars);
    return {
        kind: 'ok',
        status: execution.response.code,
        headers: (0, real_1.redactHeaders)(Object.fromEntries(execution.response.headers.map((h) => [h.key, h.value]))),
        body: (0, real_1.parseBody)(text),
        ms: execution.response.responseTime,
        url: built.url.replace(/\?.*$/, ''), // query strings can carry secrets; keep only the path in evidence
    };
}
