"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createApp = createApp;
require("express-async-errors");
const express_1 = __importStar(require("express"));
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const env_1 = require("./config/env");
const cache_service_1 = require("./core/cache/cache.service");
const redis_1 = require("./core/cache/redis");
const prisma_1 = require("./core/database/prisma");
const auth_middleware_1 = require("./core/middleware/auth.middleware");
const error_middleware_1 = require("./core/middleware/error.middleware");
const idempotency_middleware_1 = require("./core/middleware/idempotency.middleware");
const rate_limit_middleware_1 = require("./core/security/rate-limit.middleware");
const security_middleware_1 = require("./core/security/security.middleware");
const account_routes_1 = require("./modules/account/account.routes");
const admin_routes_1 = require("./modules/admin/admin.routes");
const auth_routes_1 = require("./modules/auth/auth.routes");
const chat_routes_1 = require("./modules/chat/chat.routes");
const realtime_routes_1 = require("./modules/realtime/realtime.routes");
const activity_middleware_1 = require("./modules/notifications/activity.middleware");
const notification_routes_1 = require("./modules/notifications/notification.routes");
const codegen_routes_1 = require("./modules/codegen/codegen.routes");
const collection_routes_1 = require("./modules/collections/collection.routes");
const cookie_routes_1 = require("./modules/cookies/cookie.routes");
const environment_routes_1 = require("./modules/environments/environment.routes");
const example_routes_1 = require("./modules/examples/example.routes");
const execution_routes_1 = require("./modules/execution/execution.routes");
const file_routes_1 = require("./modules/files/file.routes");
const folder_routes_1 = require("./modules/folders/folder.routes");
const history_routes_1 = require("./modules/history/history.routes");
const mock_routes_1 = require("./modules/mocks/mock.routes");
const monitor_routes_1 = require("./modules/monitors/monitor.routes");
const platform_service_1 = require("./modules/platform/platform.service");
const project_routes_1 = require("./modules/projects/project.routes");
const request_routes_1 = require("./modules/requests/request.routes");
const sync_routes_1 = require("./modules/sync/sync.routes");
const testapp_routes_1 = require("./modules/testapp/testapp.routes");
const public_routes_1 = require("./modules/testapp/public.routes");
const transfer_routes_1 = require("./modules/transfer/transfer.routes");
const workspace_routes_1 = require("./modules/workspaces/workspace.routes");
/** While maintenance mode is on only staff can use the API. */
async function maintenanceGate(req, res, next) {
    if (req.auth?.role === 'admin' || req.auth?.role === 'staff')
        return next();
    if ((await platform_service_1.platformService.settings()).maintenanceMode) {
        return res.status(503).json({ error: 'The service is under maintenance. Please try again soon.', maintenance: true });
    }
    next();
}
function apiRouter() {
    const api = (0, express_1.Router)();
    api.use(rate_limit_middleware_1.rateLimits.global());
    api.get('/health', async (_req, res) => {
        const db = await prisma_1.prisma.$queryRaw `SELECT 1`.then(() => 'ok').catch(() => 'down');
        res.json({ ok: db === 'ok', db, cache: cache_service_1.cache.backend(), redis: (0, redis_1.isRedisReady)() ? 'ok' : env_1.env.redisUrl ? 'down' : 'disabled' });
    });
    api.use('/auth/login', rate_limit_middleware_1.rateLimits.auth());
    api.use('/auth/register', rate_limit_middleware_1.rateLimits.auth());
    api.use('/auth', auth_routes_1.authRoutes);
    const authed = (0, express_1.Router)();
    authed.use(auth_middleware_1.requireAuth, idempotency_middleware_1.idempotency);
    authed.use('/admin/sounds', notification_routes_1.soundAdminRoutes);
    authed.use('/admin/broadcast', notification_routes_1.broadcastAdminRoutes);
    authed.use('/admin', admin_routes_1.adminRoutes);
    authed.use(maintenanceGate);
    authed.use('/execute', rate_limit_middleware_1.rateLimits.execute());
    authed.use('/testapps', rate_limit_middleware_1.rateLimits.testApp());
    authed.use(activity_middleware_1.activityTracker);
    const modules = [
        ['/account', account_routes_1.accountRoutes],
        ['/workspaces', workspace_routes_1.workspaceRoutes],
        ['/projects', project_routes_1.projectRoutes],
        ['/collections', collection_routes_1.collectionRoutes],
        ['/folders', folder_routes_1.folderRoutes],
        ['/requests', request_routes_1.requestRoutes],
        ['/examples', example_routes_1.exampleRoutes],
        ['/environments', environment_routes_1.environmentRoutes],
        ['/history', history_routes_1.historyRoutes],
        ['/cookies', cookie_routes_1.cookieRoutes],
        ['/execute', execution_routes_1.executionRoutes],
        ['/codegen', codegen_routes_1.codegenRoutes],
        ['/transfer', transfer_routes_1.transferRoutes],
        ['/files', file_routes_1.fileRoutes],
        ['/mocks', mock_routes_1.mockRoutes],
        ['/monitors', monitor_routes_1.monitorRoutes],
        ['/sync', sync_routes_1.syncRoutes],
        ['/notifications', notification_routes_1.notificationRoutes],
        ['/chat', chat_routes_1.chatRoutes],
        ['/realtime', realtime_routes_1.realtimeRoutes],
        ['/testapps', testapp_routes_1.testAppRoutes],
    ];
    modules.forEach(([prefix, router]) => authed.use(prefix, router));
    api.use(authed);
    return api;
}
function createApp() {
    const app = (0, express_1.default)();
    (0, security_middleware_1.applySecurity)(app);
    // Mock endpoints receive arbitrary bodies, so they are mounted before the JSON parser.
    app.use('/mock', rate_limit_middleware_1.rateLimits.mock(), mock_routes_1.mockServeRoutes);
    // Shared test apps: public, mock-only, own small body limit, per-IP+link rate limit.
    app.use('/public/testapp', rate_limit_middleware_1.rateLimits.testAppPublic(), express_1.default.json({ limit: '256kb' }), public_routes_1.publicTestAppRoutes);
    // Notification tones are public static files so <audio> can load them.
    app.use('/sounds', notification_routes_1.soundFileRoutes);
    app.use(express_1.default.json({ limit: '25mb' }));
    app.use('/api', apiRouter());
    if (fs_1.default.existsSync(env_1.env.clientDist)) {
        app.use(express_1.default.static(env_1.env.clientDist, { maxAge: '1h', index: false }));
        app.get(/^(?!\/(api|mock|public|sounds|ws|ws-proxy)(\/|$)).*/, (_req, res) => res.sendFile(path_1.default.join(env_1.env.clientDist, 'index.html')));
    }
    app.use(error_middleware_1.errorHandler);
    return app;
}
