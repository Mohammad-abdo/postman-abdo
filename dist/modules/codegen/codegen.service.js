"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.codegenService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const auth_mapper_1 = require("../../shared/postman/auth.mapper");
const request_mapper_1 = require("../../shared/postman/request.mapper");
const variables_1 = require("../../shared/postman/variables");
const workspace_access_1 = require("../workspaces/workspace.access");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const codegen = require('postman-code-generators');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk = require('postman-collection');
/** Walks request → parent folders → collection to find the auth that actually applies. */
async function effectiveAuth(request) {
    if (!(0, auth_mapper_1.isInheritedAuth)(request.auth))
        return request.auth;
    let folderId = request.folderId;
    while (folderId) {
        const folder = await prisma_1.prisma.folder.findUnique({ where: { id: folderId } });
        if (!folder)
            break;
        if (!(0, auth_mapper_1.isInheritedAuth)(folder.auth))
            return folder.auth;
        folderId = folder.parentId;
    }
    if (request.collectionId) {
        const collection = await prisma_1.prisma.collection.findUnique({ where: { id: request.collectionId } });
        if (!(0, auth_mapper_1.isInheritedAuth)(collection?.auth))
            return collection.auth;
    }
    return { type: 'noauth' };
}
/** Variable resolution order: globals < collection < environment. */
async function variableScope(workspaceId, environmentId, collectionId) {
    const [globals, collection, environment] = await Promise.all([
        prisma_1.prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } }),
        collectionId ? prisma_1.prisma.collection.findUnique({ where: { id: collectionId } }) : null,
        environmentId ? prisma_1.prisma.environment.findFirst({ where: { id: environmentId, workspaceId } }) : null,
    ]);
    const merged = new Map();
    [globals?.variables, collection?.variables, environment?.variables].forEach((vars) => (0, variables_1.scopeValues)(vars).forEach((v) => merged.set(v.key, v.value)));
    return new sdk.VariableScope({ values: Array.from(merged, ([key, value]) => ({ key, value })) });
}
/** Code generators don't sign requests, so add the simple auth headers like Postman's snippet view does. */
function applySimpleAuth(sdkRequest, auth, resolve) {
    const params = auth[auth.type] || {};
    switch (auth.type) {
        case 'basic':
            sdkRequest.headers.upsert({
                key: 'Authorization',
                value: 'Basic ' + Buffer.from(`${resolve(params.username)}:${resolve(params.password)}`).toString('base64'),
            });
            break;
        case 'bearer':
            sdkRequest.headers.upsert({ key: 'Authorization', value: `Bearer ${resolve(params.token)}` });
            break;
        case 'apikey':
            if (!params.key)
                break;
            if (params.in === 'query')
                sdkRequest.url.query.add({ key: resolve(params.key), value: resolve(params.value) });
            else
                sdkRequest.headers.upsert({ key: resolve(params.key), value: resolve(params.value) });
            break;
        case 'oauth2':
            if (params.accessToken) {
                sdkRequest.headers.upsert({ key: 'Authorization', value: `${params.headerPrefix || 'Bearer'} ${resolve(params.accessToken)}` });
            }
            break;
    }
}
exports.codegenService = {
    languages() {
        return codegen.getLanguageList().map((l) => ({
            key: l.key,
            label: l.label,
            syntaxMode: l.syntax_mode,
            variants: l.variants.map((v) => v.key),
        }));
    },
    async generate(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        const request = input.request;
        const auth = await effectiveAuth(request);
        const scope = await variableScope(input.workspaceId, input.environmentId, request.collectionId);
        const resolve = (s) => scope.replaceIn(String(s ?? ''));
        const item = (0, request_mapper_1.requestToV21Item)({ ...request, auth });
        const sdkRequest = new sdk.Request(scope.replaceIn(item.request));
        applySimpleAuth(sdkRequest, auth, resolve);
        return new Promise((resolvePromise, reject) => codegen.convert(input.language, input.variant, sdkRequest, input.options, (err, snippet) => err ? reject((0, http_error_1.BadRequest)(err.message)) : resolvePromise(snippet)));
    },
};
