"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.bootstrap = bootstrap;
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const env_1 = require("./config/env");
const prisma_1 = require("./core/database/prisma");
const idempotency_middleware_1 = require("./core/middleware/idempotency.middleware");
const testapp_service_1 = require("./modules/testapp/testapp.service");
const workspace_service_1 = require("./modules/workspaces/workspace.service");
/** Makes sure the ADMIN_EMAIL account exists and is a super admin. */
async function ensureAdmin() {
    if (!env_1.env.adminEmail)
        return;
    const existing = await prisma_1.prisma.user.findUnique({ where: { email: env_1.env.adminEmail } });
    if (existing) {
        if (existing.role !== 'admin')
            await prisma_1.prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
        return;
    }
    if (!env_1.env.adminPassword)
        return console.warn('ADMIN_EMAIL is set but ADMIN_PASSWORD is empty; admin not created');
    const admin = await prisma_1.prisma.user.create({
        data: { email: env_1.env.adminEmail, name: 'Administrator', role: 'admin', passwordHash: await bcryptjs_1.default.hash(env_1.env.adminPassword, 10), settings: {} },
    });
    await workspace_service_1.workspaceService.createPersonal(admin.id);
    console.log(`Super admin created: ${env_1.env.adminEmail}`);
}
async function bootstrap() {
    await ensureAdmin();
    await (0, idempotency_middleware_1.pruneIdempotencyRecords)();
    await (0, testapp_service_1.pruneTestAppSessions)().catch(() => undefined);
    setInterval(() => (0, testapp_service_1.pruneTestAppSessions)().catch(() => undefined), 3600 * 1000).unref();
    setInterval(() => (0, idempotency_middleware_1.pruneIdempotencyRecords)().catch(() => undefined), 24 * 3600 * 1000).unref();
}
