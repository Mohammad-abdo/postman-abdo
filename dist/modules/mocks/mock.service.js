"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.mockService = void 0;
const crypto_1 = __importDefault(require("crypto"));
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const variables_1 = require("../../shared/postman/variables");
const collection_access_1 = require("../collections/collection.access");
const workspace_access_1 = require("../workspaces/workspace.access");
const limits_service_1 = require("../platform/limits.service");
const mock_matcher_1 = require("./mock.matcher");
const newApiKey = () => 'PMAK-' + crypto_1.default.randomBytes(16).toString('hex');
const CONTENT_TYPES = {
    json: 'application/json',
    xml: 'application/xml',
    html: 'text/html',
};
async function assertMockAccess(userId, id) {
    const mock = await prisma_1.prisma.mockServer.findUnique({ where: { id } });
    if (!mock)
        throw (0, http_error_1.NotFound)('Mock server not found');
    await (0, workspace_access_1.assertWorkspaceMember)(userId, mock.workspaceId);
    return mock;
}
exports.mockService = {
    async list(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        return prisma_1.prisma.mockServer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
    },
    async create(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        await limits_service_1.limitsService.assertCanCreateMock(input.workspaceId);
        return prisma_1.prisma.mockServer.create({
            data: { ...input, environmentId: input.environmentId || null, apiKey: input.isPrivate ? newApiKey() : null },
        });
    },
    async update(userId, id, input) {
        const mock = await assertMockAccess(userId, id);
        const privacy = input.isPrivate === undefined ? {} : { isPrivate: input.isPrivate, apiKey: input.isPrivate ? mock.apiKey || newApiKey() : null };
        return prisma_1.prisma.mockServer.update({ where: { id }, data: { ...input, ...privacy } });
    },
    async remove(userId, id) {
        await assertMockAccess(userId, id);
        await prisma_1.prisma.mockServer.delete({ where: { id } });
    },
    /** Resolves an incoming mock call to the best matching saved example. */
    async respond(mockId, apiKey, query) {
        const mock = await prisma_1.prisma.mockServer.findUnique({ where: { id: mockId } });
        if (!mock)
            throw (0, http_error_1.NotFound)('Mock server not found');
        if (mock.isPrivate && apiKey !== mock.apiKey)
            throw new http_error_1.HttpError(401, 'API Key missing or invalid');
        const [collection, environment, examples] = await Promise.all([
            prisma_1.prisma.collection.findUnique({ where: { id: mock.collectionId } }),
            mock.environmentId ? prisma_1.prisma.environment.findUnique({ where: { id: mock.environmentId } }) : null,
            prisma_1.prisma.example.findMany({ where: { parent: { collectionId: mock.collectionId } }, include: { parent: true } }),
        ]);
        const vars = new Map();
        [collection?.variables, environment?.variables].forEach((list) => (0, variables_1.scopeValues)(list).forEach((v) => vars.set(v.key, String(v.value))));
        const candidates = examples.map((ex) => {
            const original = ex.request || {};
            return {
                ...ex,
                method: original.method || ex.parent.method,
                url: (0, mock_matcher_1.replaceVariables)(original.url || ex.parent.url, vars),
            };
        });
        const match = (0, mock_matcher_1.findBestMatch)(candidates, query);
        if (!match)
            throw (0, http_error_1.NotFound)('No matching requests. Double check your method and the request path and try again.');
        const headers = {};
        (match.headers || [])
            .filter((h) => h.enabled !== false && h.key && !/^(content-length|transfer-encoding|connection)$/i.test(h.key))
            .forEach((h) => (headers[h.key] = (0, mock_matcher_1.replaceVariables)(String(h.value), vars)));
        if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
            headers['Content-Type'] = CONTENT_TYPES[match.language] || 'text/plain';
        }
        headers['x-srv-trace'] = `mock:${mock.id}`;
        return { status: match.code || 200, headers, body: (0, mock_matcher_1.replaceVariables)(match.body || '', vars), delay: mock.delay };
    },
};
