"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.monitorService = void 0;
const env_1 = require("../../config/env");
const prisma_1 = require("../../core/database/prisma");
const security_middleware_1 = require("../../core/security/security.middleware");
const http_error_1 = require("../../core/errors/http-error");
const collection_access_1 = require("../collections/collection.access");
const collection_service_1 = require("../collections/collection.service");
const runtime_adapter_1 = require("../execution/runtime/runtime.adapter");
const serializers_1 = require("../execution/runtime/serializers");
const variable_scopes_1 = require("../execution/variable-scopes");
const workspace_access_1 = require("../workspaces/workspace.access");
const limits_service_1 = require("../platform/limits.service");
const monitor_scheduler_1 = require("./monitor.scheduler");
async function assertMonitorAccess(userId, id) {
    const monitor = await prisma_1.prisma.monitor.findUnique({ where: { id } });
    if (!monitor)
        throw (0, http_error_1.NotFound)('Monitor not found');
    await (0, workspace_access_1.assertWorkspaceMember)(userId, monitor.workspaceId);
    return monitor;
}
/**
 * Monitors run like Postman's cloud monitors: no local cookie jar and variable changes are not persisted.
 */
async function execute(monitorId) {
    const monitor = await prisma_1.prisma.monitor.findUniqueOrThrow({ where: { id: monitorId } });
    const result = await (0, runtime_adapter_1.runCollection)({
        collection: await collection_service_1.collectionService.toPostman(monitor.collectionId, { forRun: true, useCurrentValues: true }),
        ...(0, variable_scopes_1.runtimeValues)(await (0, variable_scopes_1.loadScopes)(monitor.workspaceId, monitor.environmentId)),
        settings: { restrictedAddresses: env_1.env.blockPrivateNetworks ? security_middleware_1.PRIVATE_NETWORKS : undefined },
    });
    await prisma_1.prisma.monitor.update({ where: { id: monitorId }, data: { lastRunAt: new Date() } });
    return prisma_1.prisma.collectionRun.create({
        data: {
            workspaceId: monitor.workspaceId,
            collectionId: monitor.collectionId,
            monitorId,
            source: 'monitor',
            name: monitor.name,
            stats: (0, prisma_1.json)({ ...result.stats, error: result.error, requestErrors: result.executions.filter((e) => e.error).length }),
            results: (0, prisma_1.json)(result.executions.map((e) => ({ ...(0, serializers_1.stripBody)(e), visualizer: null }))),
        },
    });
}
const scheduler = new monitor_scheduler_1.MonitorScheduler(execute);
exports.monitorService = {
    async startAll() {
        (await prisma_1.prisma.monitor.findMany()).forEach((m) => scheduler.schedule(m));
    },
    async list(userId, workspaceId) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, workspaceId);
        return prisma_1.prisma.monitor.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
    },
    async create(userId, input) {
        await (0, workspace_access_1.assertWorkspaceMember)(userId, input.workspaceId);
        await (0, collection_access_1.assertCollectionAccess)(userId, input.collectionId);
        await limits_service_1.limitsService.assertCanCreateMonitor(input.workspaceId);
        const monitor = await prisma_1.prisma.monitor.create({ data: { ...input, environmentId: input.environmentId || null } });
        scheduler.schedule(monitor);
        return monitor;
    },
    async update(userId, id, input) {
        await assertMonitorAccess(userId, id);
        const monitor = await prisma_1.prisma.monitor.update({ where: { id }, data: input });
        scheduler.schedule(monitor);
        return monitor;
    },
    async remove(userId, id) {
        await assertMonitorAccess(userId, id);
        scheduler.unschedule(id);
        await prisma_1.prisma.monitor.delete({ where: { id } });
    },
    async runNow(userId, id) {
        await assertMonitorAccess(userId, id);
        return execute(id);
    },
    async runs(userId, id) {
        await assertMonitorAccess(userId, id);
        // Light rows only: the per-request `results` JSON of 100 runs is huge and made this endpoint fail.
        return prisma_1.prisma.collectionRun.findMany({
            where: { monitorId: id },
            orderBy: { createdAt: 'desc' },
            take: 100,
            select: { id: true, workspaceId: true, collectionId: true, monitorId: true, source: true, name: true, stats: true, createdAt: true },
        });
    },
    /** Full results of one run (loaded when the user selects it). */
    async run(userId, id, runId) {
        await assertMonitorAccess(userId, id);
        const run = await prisma_1.prisma.collectionRun.findFirst({ where: { id: runId, monitorId: id } });
        if (!run)
            throw (0, http_error_1.NotFound)('Run not found');
        return run;
    },
};
