"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.executionService = void 0;
const crypto_1 = require("crypto");
const env_1 = require("../../config/env");
const security_middleware_1 = require("../../core/security/security.middleware");
const limits_service_1 = require("../platform/limits.service");
const prisma_1 = require("../../core/database/prisma");
const request_mapper_1 = require("../../shared/postman/request.mapper");
const auth_service_1 = require("../auth/auth.service");
const collection_access_1 = require("../collections/collection.access");
const collection_service_1 = require("../collections/collection.service");
const cookie_service_1 = require("../cookies/cookie.service");
const history_service_1 = require("../history/history.service");
const workspace_access_1 = require("../workspaces/workspace.access");
const runtime_adapter_1 = require("./runtime/runtime.adapter");
const serializers_1 = require("./runtime/serializers");
const variable_scopes_1 = require("./variable-scopes");
/** Request-level settings override the user's global settings (Settings → General). */
function resolveSettings(user, request = {}) {
    return {
        strictSSL: request.strictSSL ?? user.sslVerification !== false,
        followRedirects: request.followRedirects ?? user.followRedirects !== false,
        timeout: Number(user.requestTimeout) || 0,
        maxResponseSize: Number(user.maxResponseSize) || 0,
        disableCookies: !!request.disableCookies,
        restrictedAddresses: env_1.env.blockPrivateNetworks ? security_middleware_1.PRIVATE_NETWORKS : undefined,
    };
}
exports.executionService = {
    /** The "Send" button: runs one (possibly unsaved) request with its collection's scripts, auth and variables. */
    async send(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        await limits_service_1.limitsService.consumeRequests(userId, 1);
        const draft = { ...input.request, id: input.request.id || (0, crypto_1.randomUUID)() };
        const collectionId = input.request.collectionId || null;
        if (collectionId)
            await (0, collection_access_1.assertCollectionAccess)(userId, collectionId);
        const collection = collectionId
            ? await collection_service_1.collectionService.toPostman(collectionId, { forRun: true, draft, useCurrentValues: true })
            : { info: { name: 'Scratch Pad' }, item: [(0, request_mapper_1.requestToV21Item)(draft, { forRun: true })] };
        const scopes = await (0, variable_scopes_1.loadScopes)(input.workspaceId, input.environmentId);
        const jar = await cookie_service_1.cookieService.load(userId);
        const result = await (0, runtime_adapter_1.runCollection)({
            collection,
            entrypoint: draft.id,
            ...(0, variable_scopes_1.runtimeValues)(scopes),
            settings: resolveSettings(await auth_service_1.authService.settings(userId), input.request.settings),
            cookieJar: jar,
        });
        await cookie_service_1.cookieService.save(userId, jar);
        const variableUpdates = await (0, variable_scopes_1.persistScopes)(result, scopes, collectionId);
        const execution = result.executions[result.executions.length - 1] || null;
        await limits_service_1.limitsService.recordUsage(userId, { errors: execution?.error ? 1 : 0, bytes: execution?.response?.size.total || 0 });
        const history = execution && (execution.request || execution.error)
            ? await history_service_1.historyService.record({
                workspaceId: input.workspaceId,
                userId,
                request: input.request,
                response: execution.response
                    ? { code: execution.response.code, status: execution.response.status, time: execution.response.responseTime, size: execution.response.size.total }
                    : { error: execution.error },
            })
            : null;
        return { execution, console: result.console, error: result.error, variableUpdates, history };
    },
    /** Collection Runner; progress is reported through hooks.onEvent. */
    async run(userId, input, hooks) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        const collection = await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        const requestCount = input.requestIds?.length || (await prisma_1.prisma.request.count({ where: { collectionId: input.collectionId, type: 'http' } }));
        await limits_service_1.limitsService.consumeRequests(userId, Math.max(requestCount, 1) * input.iterations, 'runs');
        const scopes = await (0, variable_scopes_1.loadScopes)(input.workspaceId, input.environmentId);
        const jar = await cookie_service_1.cookieService.load(userId);
        const hasData = !!input.data?.length;
        let aborted = false;
        hooks.onEvent('start', { collection: collection.name, iterations: input.iterations });
        const result = await (0, runtime_adapter_1.runCollection)({
            collection: await collection_service_1.collectionService.toPostman(input.collectionId, { forRun: true, useCurrentValues: true }),
            entrypoint: input.requestIds?.length ? input.requestIds : input.folderId || undefined,
            ...(0, variable_scopes_1.runtimeValues)(scopes),
            data: hasData ? input.data : undefined,
            iterationCount: input.iterations,
            delay: input.delay,
            bail: input.bail,
            settings: { ...resolveSettings(await auth_service_1.authService.settings(userId)), disableCookies: input.disableCookies },
            cookieJar: input.disableCookies ? undefined : jar,
            registerAbort: (abort) => hooks.registerAbort(() => {
                aborted = true;
                abort();
            }),
            onEvent: (event, payload) => hooks.onEvent(event, event === 'item' && !input.persistResponses ? (0, serializers_1.stripBody)(payload) : payload),
        });
        if (input.saveCookies && !input.disableCookies)
            await cookie_service_1.cookieService.save(userId, jar);
        const variableUpdates = input.persistVariables ? await (0, variable_scopes_1.persistScopes)(result, scopes, input.collectionId) : {};
        const saved = await prisma_1.prisma.collectionRun.create({
            data: {
                workspaceId: input.workspaceId,
                collectionId: input.collectionId,
                source: 'runner',
                name: collection.name,
                stats: { ...result.stats, aborted, environmentId: input.environmentId || null },
                results: (0, prisma_1.json)(result.executions.map((e) => ({ ...(input.persistResponses ? e : (0, serializers_1.stripBody)(e)), visualizer: null }))),
            },
        });
        return { runId: saved.id, stats: result.stats, error: result.error, aborted, variableUpdates };
    },
};
