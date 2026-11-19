"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runtimeValues = void 0;
exports.loadScopes = loadScopes;
exports.persistScopes = persistScopes;
const prisma_1 = require("../../core/database/prisma");
const object_1 = require("../../core/utils/object");
const variables_1 = require("../../shared/postman/variables");
const environment_service_1 = require("../environments/environment.service");
async function loadScopes(workspaceId, environmentId) {
    const [environment, globals] = await Promise.all([
        environmentId ? prisma_1.prisma.environment.findFirst({ where: { id: environmentId, workspaceId } }) : null,
        environment_service_1.environmentService.globals(workspaceId),
    ]);
    return { environment, globals };
}
const runtimeValues = (scopes) => ({
    environment: scopes.environment ? (0, variables_1.scopeValues)(scopes.environment.variables) : [],
    globals: (0, variables_1.scopeValues)(scopes.globals.variables),
});
exports.runtimeValues = runtimeValues;
async function persistEnvironment(env, values) {
    const merged = (0, variables_1.mergeScope)(env.variables, values);
    if ((0, object_1.sameJson)(merged, env.variables || []))
        return undefined;
    await prisma_1.prisma.environment.update({ where: { id: env.id }, data: { variables: (0, prisma_1.json)(merged) } });
    return { id: env.id, variables: merged };
}
/** Writes variable changes made by scripts back to the database as current values. */
async function persistScopes(result, scopes, collectionId) {
    const updates = {};
    if (scopes.environment)
        updates.environment = await persistEnvironment(scopes.environment, result.environment);
    updates.globals = await persistEnvironment(scopes.globals, result.globals);
    if (collectionId) {
        const collection = await prisma_1.prisma.collection.findUnique({ where: { id: collectionId } });
        if (collection) {
            const merged = (0, variables_1.mergeScope)(collection.variables, result.collectionVariables);
            if (!(0, object_1.sameJson)(merged, collection.variables || [])) {
                await prisma_1.prisma.collection.update({ where: { id: collectionId }, data: { variables: (0, prisma_1.json)(merged) } });
                updates.collection = { id: collectionId, variables: merged };
            }
        }
    }
    return updates;
}
