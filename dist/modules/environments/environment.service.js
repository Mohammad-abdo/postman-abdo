"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.environmentService = void 0;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const workspace_access_1 = require("../workspaces/workspace.access");
async function assertEnvironmentAccess(userId, id) {
    const environment = await prisma_1.prisma.environment.findUnique({ where: { id } });
    if (!environment)
        throw (0, http_error_1.NotFound)('Environment not found');
    await (0, workspace_access_1.assertWorkspaceMember)(userId, environment.workspaceId);
    return environment;
}
exports.environmentService = {
    async list(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        await this.globals(workspaceId);
        return prisma_1.prisma.environment.findMany({ where: { workspaceId }, orderBy: [{ isGlobal: 'desc' }, { createdAt: 'asc' }] });
    },
    /** The workspace's Globals scope, created on demand. */
    async globals(workspaceId) {
        const existing = await prisma_1.prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } });
        return existing || prisma_1.prisma.environment.create({ data: { workspaceId, name: 'Globals', isGlobal: true, variables: [] } });
    },
    async create(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        if (input.id) {
            const existing = await prisma_1.prisma.environment.findUnique({ where: { id: input.id } });
            if (existing)
                return existing;
        }
        return prisma_1.prisma.environment.create({ data: { ...input, projectId: input.projectId || null, variables: (0, prisma_1.json)(input.variables) } });
    },
    async update(userId, id, input) {
        await assertEnvironmentAccess(userId, id);
        return prisma_1.prisma.environment.update({ where: { id }, data: input });
    },
    async remove(userId, id) {
        const environment = await assertEnvironmentAccess(userId, id);
        if (environment.isGlobal)
            throw (0, http_error_1.BadRequest)('Globals cannot be deleted');
        await prisma_1.prisma.environment.delete({ where: { id } });
    },
    async duplicate(userId, id) {
        const environment = await assertEnvironmentAccess(userId, id);
        return prisma_1.prisma.environment.create({
            data: { workspaceId: environment.workspaceId, name: `${environment.name} Copy`, variables: (0, prisma_1.json)(environment.variables) },
        });
    },
    async export(userId, id) {
        return this.toPostman(await assertEnvironmentAccess(userId, id));
    },
    /** Postman environment/globals file format (initial values only, like Postman exports). */
    toPostman(environment) {
        return {
            id: environment.id,
            name: environment.name,
            values: (environment.variables || []).map((v) => ({
                key: v.key,
                value: v.value ?? '',
                type: v.type === 'secret' ? 'secret' : 'default',
                enabled: v.enabled !== false,
            })),
            _postman_variable_scope: environment.isGlobal ? 'globals' : 'environment',
            _postman_exported_at: new Date().toISOString(),
            _postman_exported_using: 'Fack Postman',
        };
    },
};
