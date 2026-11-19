"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferService = void 0;
const yaml_1 = __importDefault(require("yaml"));
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const safe_fetch_1 = require("../../core/security/safe-fetch");
const auth_mapper_1 = require("../../shared/postman/auth.mapper");
const kv_mapper_1 = require("../../shared/postman/kv.mapper");
const request_mapper_1 = require("../../shared/postman/request.mapper");
const script_mapper_1 = require("../../shared/postman/script.mapper");
const variables_1 = require("../../shared/postman/variables");
const curl_parser_1 = require("./curl.parser");
const openapi_converter_1 = require("./openapi.converter");
const isV1Collection = (json) => Array.isArray(json.requests) && !json.info;
const isCollection = (json) => Boolean(json.info && Array.isArray(json.item)) || isV1Collection(json);
const isEnvironment = (json) => Array.isArray(json.values) && Boolean(json.name || json._postman_variable_scope);
const isDataDump = (json) => Array.isArray(json.collections) || Array.isArray(json.environments);
function parseStructured(text) {
    try {
        return JSON.parse(text);
    }
    catch {
        try {
            const parsed = yaml_1.default.parse(text);
            return typeof parsed === 'object' ? parsed : null;
        }
        catch {
            return null;
        }
    }
}
exports.transferService = {
    /** Recursively writes v2 items (folders + requests + examples) under a parent folder. */
    async importItems(collectionId, parentId, items, startOrder = 0) {
        let order = startOrder;
        for (const item of items || []) {
            if (Array.isArray(item.item)) {
                const scripts = (0, script_mapper_1.scriptsFromEvents)(item.event);
                const folder = await prisma_1.prisma.folder.create({
                    data: {
                        collectionId,
                        parentId,
                        name: item.name || 'New Folder',
                        description: (0, kv_mapper_1.descriptionText)(item.description),
                        auth: (0, auth_mapper_1.authFromV2)(item.auth),
                        preRequestScript: scripts.pre,
                        testScript: scripts.test,
                        sortOrder: order++,
                    },
                });
                await this.importItems(collectionId, folder.id, item.item);
                continue;
            }
            const request = await prisma_1.prisma.request.create({
                data: { ...(0, request_mapper_1.requestFromV2Item)(item), collectionId, folderId: parentId, sortOrder: order++ },
            });
            const responses = Array.isArray(item.response) ? item.response : [];
            for (const [i, response] of responses.entries()) {
                await prisma_1.prisma.example.create({ data: { ...(0, request_mapper_1.exampleFromV2)(response, i), requestId: request.id } });
            }
        }
    },
    async importCollection(workspaceId, json, nameOverride) {
        const collection = isV1Collection(json) ? await (0, openapi_converter_1.upgradeV1Collection)(json) : json;
        const info = collection.info || {};
        const scripts = (0, script_mapper_1.scriptsFromEvents)(collection.event);
        const created = await prisma_1.prisma.collection.create({
            data: {
                workspaceId,
                name: nameOverride || info.name || 'Imported Collection',
                description: (0, kv_mapper_1.descriptionText)(info.description),
                auth: (0, prisma_1.json)((0, auth_mapper_1.authFromV2)(collection.auth)),
                variables: (0, prisma_1.json)((0, variables_1.variablesFromV2)(collection.variable)),
                preRequestScript: scripts.pre,
                testScript: scripts.test,
                sortOrder: await prisma_1.prisma.collection.count({ where: { workspaceId } }),
            },
        });
        await this.importItems(created.id, null, collection.item || []);
        return created;
    },
    /** Environment files become new environments; a globals file merges into the workspace globals. */
    async importEnvironment(workspaceId, json) {
        const values = (json.values || []).map((v) => ({
            key: v.key,
            value: v.value == null ? '' : String(v.value),
            currentValue: '',
            type: v.type === 'secret' ? 'secret' : 'default',
            enabled: v.enabled !== false,
        }));
        if (json._postman_variable_scope === 'globals') {
            const globals = await prisma_1.prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } });
            if (globals) {
                const existing = (globals.variables || []).filter((e) => !values.some((v) => v.key === e.key));
                return prisma_1.prisma.environment.update({ where: { id: globals.id }, data: { variables: (0, prisma_1.json)([...existing, ...values]) } });
            }
        }
        return prisma_1.prisma.environment.create({
            data: { workspaceId, name: json.name || 'Imported Environment', variables: (0, prisma_1.json)(values) },
        });
    },
    /** Detects the format of arbitrary text (collection, environment, dump, OpenAPI, cURL) and imports it. */
    async importText(workspaceId, text, fileName) {
        const trimmed = text.trim();
        if (/^curl\s/i.test(trimmed))
            return { kind: 'request', request: (0, curl_parser_1.parseCurl)(trimmed) };
        const json = parseStructured(trimmed);
        if (!json)
            throw (0, http_error_1.BadRequest)('Unrecognized format. Paste a Postman collection, environment, OpenAPI spec or cURL command.');
        if (isDataDump(json)) {
            for (const c of json.collections || [])
                await this.importCollection(workspaceId, c);
            for (const e of json.environments || [])
                await this.importEnvironment(workspaceId, e);
            return { kind: 'dump', collections: (json.collections || []).length, environments: (json.environments || []).length };
        }
        if (isCollection(json))
            return { kind: 'collection', collection: await this.importCollection(workspaceId, json) };
        if (isEnvironment(json))
            return { kind: 'environment', environment: await this.importEnvironment(workspaceId, json) };
        if ((0, openapi_converter_1.isOpenApi)(json))
            return { kind: 'collection', collection: await this.importCollection(workspaceId, await (0, openapi_converter_1.openApiToCollection)(json)) };
        throw (0, http_error_1.BadRequest)(`Could not detect the format of ${fileName || 'the input'}`);
    },
    /** Fetches a remote collection/spec through the SSRF-guarded fetcher. */
    fetchText: (url) => (0, safe_fetch_1.safeFetchText)(url),
};
