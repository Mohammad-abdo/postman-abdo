"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.shareService = exports.publicSessionSchema = exports.publicInvokeSchema = exports.unlockSchema = exports.createShareSchema = void 0;
const crypto_1 = __importDefault(require("crypto"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const env_1 = require("../../config/env");
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const public_1 = require("../../shared/testapp/public");
const util_1 = require("../../shared/testapp/util");
const workspace_access_1 = require("../workspaces/workspace.access");
const zod_1 = require("zod");
const testapp_service_1 = require("./testapp.service");
const SHARE_SESSION_TTL_MS = 2 * 3600 * 1000;
const MAX_ACTIVE_SHARES = 10;
const gone = () => (0, http_error_1.NotFound)('This link does not exist, has expired or was revoked.');
exports.createShareSchema = zod_1.z.object({
    expiresInHours: zod_1.z.number().int().min(1).max(24 * 90).nullable().optional(),
    password: zod_1.z.string().min(4).max(100).optional(),
    maxSessions: zod_1.z.number().int().min(1).max(200).optional(),
    requestQuota: zod_1.z.number().int().min(10).max(20000).optional(),
});
exports.unlockSchema = zod_1.z.object({ password: zod_1.z.string().max(100) });
exports.publicInvokeSchema = zod_1.z.object({
    actionId: zod_1.z.string().min(1).max(200),
    values: zod_1.z.record(zod_1.z.any()).default({}),
    scenario: zod_1.z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']).optional(),
});
exports.publicSessionSchema = zod_1.z.object({ seed: zod_1.z.number().int().min(1).max(2_000_000_000).optional() });
async function managed(userId, appId) {
    const app = await prisma_1.prisma.testApp.findUnique({ where: { id: appId } });
    if (!app)
        throw (0, http_error_1.NotFound)('Test app not found');
    const member = await (0, workspace_access_1.assertWorkspaceMember)(userId, app.workspaceId);
    if (member.role === 'viewer')
        throw (0, http_error_1.Forbidden)('Viewers cannot manage share links');
    return app;
}
exports.shareService = {
    async create(userId, appId, input) {
        const app = await managed(userId, appId);
        if (!app.currentVersionId)
            throw (0, http_error_1.NotFound)('Nothing to share yet');
        const active = await prisma_1.prisma.testAppShare.count({ where: { testAppId: appId, revokedAt: null } });
        if (active >= MAX_ACTIVE_SHARES)
            throw (0, http_error_1.Forbidden)(`Up to ${MAX_ACTIVE_SHARES} active links per test app. Revoke one first.`);
        const token = crypto_1.default.randomBytes(32).toString('base64url');
        const share = await prisma_1.prisma.testAppShare.create({
            data: {
                testAppId: appId,
                versionId: app.currentVersionId,
                tokenHash: (0, util_1.sha256)(token),
                passwordHash: input.password ? await bcryptjs_1.default.hash(input.password, 10) : null,
                expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600 * 1000) : null,
                maxSessions: input.maxSessions ?? 25,
                requestQuota: input.requestQuota ?? 2000,
                createdById: userId,
            },
        });
        return { share: shareView(share), token, path: `/t/${token}` }; // the token is returned ONCE
    },
    async list(userId, appId) {
        await managed(userId, appId);
        const shares = await prisma_1.prisma.testAppShare.findMany({ where: { testAppId: appId }, orderBy: { createdAt: 'desc' } });
        const versions = await prisma_1.prisma.testAppVersion.findMany({ where: { id: { in: shares.map((s) => s.versionId) } }, select: { id: true, version: true } });
        return shares.map((s) => ({ ...shareView(s), version: versions.find((v) => v.id === s.versionId)?.version }));
    },
    async revoke(userId, appId, shareId) {
        await managed(userId, appId);
        const share = await prisma_1.prisma.testAppShare.findUnique({ where: { id: shareId } });
        if (!share || share.testAppId !== appId)
            throw (0, http_error_1.NotFound)('Share not found');
        await prisma_1.prisma.testAppShare.update({ where: { id: shareId }, data: { revokedAt: share.revokedAt || new Date() } });
        await prisma_1.prisma.testAppSession.deleteMany({ where: { shareId } });
    },
    /* ---------------------------- public side ---------------------------- */
    async resolve(token) {
        if (!/^[A-Za-z0-9_-]{20,80}$/.test(token))
            throw gone();
        const share = await prisma_1.prisma.testAppShare.findUnique({ where: { tokenHash: (0, util_1.sha256)(token) } });
        if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < new Date()))
            throw gone();
        return share;
    },
    assertUnlocked(share, header) {
        if (!share.passwordHash)
            return;
        try {
            const p = jsonwebtoken_1.default.verify(String(header || ''), env_1.env.jwtSecret);
            if (p.shr === share.id)
                return;
        }
        catch {
            /* fall through */
        }
        throw (0, http_error_1.Unauthorized)('This link is password protected');
    },
    async meta(token) {
        const share = await exports.shareService.resolve(token);
        const app = await prisma_1.prisma.testApp.findUnique({ where: { id: share.testAppId }, select: { name: true } });
        return { name: app?.name || 'Test app', requiresPassword: !!share.passwordHash, expiresAt: share.expiresAt };
    },
    async unlock(token, password) {
        const share = await exports.shareService.resolve(token);
        if (!share.passwordHash)
            return { unlock: null };
        if (!(await bcryptjs_1.default.compare(password, share.passwordHash)))
            throw (0, http_error_1.Unauthorized)('Wrong password');
        return { unlock: jsonwebtoken_1.default.sign({ shr: share.id }, env_1.env.jwtSecret, { expiresIn: '12h' }) };
    },
    async schema(token, unlock) {
        const share = await exports.shareService.resolve(token);
        exports.shareService.assertUnlocked(share, unlock);
        const v = await prisma_1.prisma.testAppVersion.findUnique({ where: { id: share.versionId }, select: { schema: true } });
        if (!v)
            throw gone();
        return (0, public_1.publicSchema)(v.schema);
    },
    async openSession(token, unlock, seed) {
        const share = await exports.shareService.resolve(token);
        exports.shareService.assertUnlocked(share, unlock);
        const active = await prisma_1.prisma.testAppSession.count({ where: { shareId: share.id, expiresAt: { gt: new Date() } } });
        if (active >= share.maxSessions)
            throw new http_error_1.HttpError(429, 'This shared app has too many active sessions. Try again later.');
        const v = await prisma_1.prisma.testAppVersion.findUniqueOrThrow({ where: { id: share.versionId } });
        // sessions are created through the shared engine; ownerId marks them as anonymous visitors of this share
        const owner = `share:${share.id}`;
        const created = await testapp_service_1.testAppService.createAnonymousSession(share.testAppId, v.id, owner, share.id, seed, SHARE_SESSION_TTL_MS);
        return created;
    },
    async loadSession(token, unlock, sessionId) {
        const share = await exports.shareService.resolve(token);
        exports.shareService.assertUnlocked(share, unlock);
        const s = await prisma_1.prisma.testAppSession.findUnique({ where: { id: sessionId } });
        if (!s || s.shareId !== share.id || s.expiresAt < new Date())
            throw (0, http_error_1.NotFound)('Session not found');
        const app = await prisma_1.prisma.testApp.findUniqueOrThrow({ where: { id: share.testAppId } });
        return { share, app, s };
    },
    async invoke(token, unlock, sessionId, input) {
        const { share, app, s } = await exports.shareService.loadSession(token, unlock, sessionId);
        const used = await prisma_1.prisma.testAppShare.updateMany({ where: { id: share.id, requestCount: { lt: share.requestQuota } }, data: { requestCount: { increment: 1 } } });
        if (!used.count)
            throw new http_error_1.HttpError(429, 'The request quota of this shared link is used up.');
        // visitors can only run mapped actions; raw endpoints/paths/bodies are not accepted
        return testapp_service_1.testAppService.invokeOnSession(app, s, { actionId: input.actionId, values: input.values, scenario: input.scenario });
    },
    async reset(token, unlock, sessionId) {
        const { app, s } = await exports.shareService.loadSession(token, unlock, sessionId);
        return testapp_service_1.testAppService.resetSession(app, s);
    },
};
function shareView(s) {
    return { id: s.id, versionId: s.versionId, hasPassword: !!s.passwordHash, expiresAt: s.expiresAt, revokedAt: s.revokedAt, maxSessions: s.maxSessions, requestQuota: s.requestQuota, requestCount: s.requestCount, createdAt: s.createdAt };
}
