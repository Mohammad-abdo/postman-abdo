import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { TestApp, TestAppShare } from '@prisma/client';
import { env } from '../../config/env';
import { prisma } from '../../core/database/prisma';
import { Forbidden, HttpError, NotFound, Unauthorized } from '../../core/errors/http-error';
import { publicSchema } from '../../shared/testapp/public';
import { publishRemixSchema } from '../../shared/testapp/design/customize';

const MAX_REMIXES = 500;
import { withDesign } from '../../shared/testapp/design/design';
import { AppSchema } from '../../shared/testapp/types';
import { sha256 } from '../../shared/testapp/util';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { z } from 'zod';
import { testAppService } from './testapp.service';

const SHARE_SESSION_TTL_MS = 2 * 3600 * 1000;
const MAX_ACTIVE_SHARES = 10;
const gone = () => NotFound('This link does not exist, has expired or was revoked.');

export const createShareSchema = z.object({
  expiresInHours: z.number().int().min(1).max(24 * 90).nullable().optional(),
  password: z.string().min(4).max(100).optional(),
  maxSessions: z.number().int().min(1).max(200).optional(),
  requestQuota: z.number().int().min(10).max(20000).optional(),
});
export const unlockSchema = z.object({ password: z.string().max(100) });
export const publicInvokeSchema = z.object({
  actionId: z.string().min(1).max(200),
  values: z.record(z.any()).default({}),
  scenario: z.enum(['success', 'empty', 'validation', 'unauthorized', 'notFound', 'serverError']).optional(),
});
export const publicSessionSchema = z.object({ seed: z.number().int().min(1).max(2_000_000_000).optional() });

async function managed(userId: string, appId: string): Promise<TestApp> {
  const app = await prisma.testApp.findUnique({ where: { id: appId } });
  if (!app) throw NotFound('Test app not found');
  const member = await assertWorkspaceMember(userId, app.workspaceId);
  if (member.role === 'viewer') throw Forbidden('Viewers cannot manage share links');
  return app;
}

export const shareService = {
  async create(userId: string, appId: string, input: z.infer<typeof createShareSchema>) {
    const app = await managed(userId, appId);
    if (!app.currentVersionId) throw NotFound('Nothing to share yet');
    const active = await prisma.testAppShare.count({ where: { testAppId: appId, revokedAt: null } });
    if (active >= MAX_ACTIVE_SHARES) throw Forbidden(`Up to ${MAX_ACTIVE_SHARES} active links per test app. Revoke one first.`);
    const token = crypto.randomBytes(32).toString('base64url');
    const share = await prisma.testAppShare.create({
      data: {
        testAppId: appId,
        versionId: app.currentVersionId,
        tokenHash: sha256(token),
        passwordHash: input.password ? await bcrypt.hash(input.password, 10) : null,
        expiresAt: input.expiresInHours ? new Date(Date.now() + input.expiresInHours * 3600 * 1000) : null,
        maxSessions: input.maxSessions ?? 25,
        requestQuota: input.requestQuota ?? 2000,
        createdById: userId,
      },
    });
    return { share: shareView(share), token, path: `/t/${token}` }; // the token is returned ONCE
  },

  async list(userId: string, appId: string) {
    await managed(userId, appId);
    const shares = await prisma.testAppShare.findMany({ where: { testAppId: appId }, orderBy: { createdAt: 'desc' } });
    const versions = await prisma.testAppVersion.findMany({ where: { id: { in: shares.map((s) => s.versionId) } }, select: { id: true, version: true } });
    return shares.map((s) => ({ ...shareView(s), version: versions.find((v) => v.id === s.versionId)?.version }));
  },

  async revoke(userId: string, appId: string, shareId: string) {
    await managed(userId, appId);
    const share = await prisma.testAppShare.findUnique({ where: { id: shareId } });
    if (!share || share.testAppId !== appId) throw NotFound('Share not found');
    await prisma.testAppShare.update({ where: { id: shareId }, data: { revokedAt: share.revokedAt || new Date() } });
    await prisma.testAppSession.deleteMany({ where: { shareId } });
  },

  /* ---------------------------- public side ---------------------------- */

  async resolve(token: string): Promise<TestAppShare> {
    if (!/^[A-Za-z0-9_-]{20,80}$/.test(token)) throw gone();
    const share = await prisma.testAppShare.findUnique({ where: { tokenHash: sha256(token) } });
    if (!share || share.revokedAt || (share.expiresAt && share.expiresAt < new Date())) throw gone();
    return share;
  },

  assertUnlocked(share: TestAppShare, header: string | undefined) {
    if (!share.passwordHash) return;
    try {
      const p = jwt.verify(String(header || ''), env.jwtSecret) as { shr?: string };
      if (p.shr === share.id) return;
    } catch {
      /* fall through */
    }
    throw Unauthorized('This link is password protected');
  },

  async meta(token: string) {
    const share = await shareService.resolve(token);
    const app = await prisma.testApp.findUnique({ where: { id: share.testAppId }, select: { name: true } });
    return { name: app?.name || 'Test app', requiresPassword: !!share.passwordHash, expiresAt: share.expiresAt };
  },

  async unlock(token: string, password: string) {
    const share = await shareService.resolve(token);
    if (!share.passwordHash) return { unlock: null };
    if (!(await bcrypt.compare(password, share.passwordHash))) throw Unauthorized('Wrong password');
    return { unlock: jwt.sign({ shr: share.id }, env.jwtSecret, { expiresIn: '12h' }) };
  },

  /** The shared app, with the owner's design, or with a published version when `remixId` is given. */
  async schema(token: string, unlock?: string, remixId?: string) {
    const share = await shareService.resolve(token);
    shareService.assertUnlocked(share, unlock);
    const v = await prisma.testAppVersion.findUnique({ where: { id: share.versionId }, select: { schema: true, model: true } });
    if (!v) throw gone();
    const app = await prisma.testApp.findUnique({ where: { id: share.testAppId }, select: { settings: true } });
    const remix = remixId ? await prisma.testAppRemix.findFirst({ where: { id: remixId, shareId: share.id }, select: { id: true, name: true, author: true, customization: true, createdAt: true } }) : null;
    const owner = (app?.settings as { design?: unknown } | null)?.design ?? null;
    return { ...publicSchema(withDesign(v.schema as unknown as AppSchema, v.model)), customization: remix ? remix.customization : owner, remix: remix ? { id: remix.id, name: remix.name, author: remix.author, createdAt: remix.createdAt } : null };
  },

  /** A visitor publishes their own design of the shared app; it gets its own link. */
  async publishRemix(token: string, unlock: string | undefined, input: z.infer<typeof publishRemixSchema>) {
    const share = await shareService.resolve(token);
    shareService.assertUnlocked(share, unlock);
    const count = await prisma.testAppRemix.count({ where: { shareId: share.id } });
    if (count >= MAX_REMIXES) throw new HttpError(429, 'This shared app has reached its limit of published designs.');
    const remix = await prisma.testAppRemix.create({ data: { testAppId: share.testAppId, shareId: share.id, name: input.name, author: input.author || null, customization: input.customization as object } });
    return { id: remix.id };
  },

  async openSession(token: string, unlock: string | undefined, seed?: number) {
    const share = await shareService.resolve(token);
    shareService.assertUnlocked(share, unlock);
    const active = await prisma.testAppSession.count({ where: { shareId: share.id, expiresAt: { gt: new Date() } } });
    if (active >= share.maxSessions) throw new HttpError(429, 'This shared app has too many active sessions. Try again later.');
    const v = await prisma.testAppVersion.findUniqueOrThrow({ where: { id: share.versionId } });
    // sessions are created through the shared engine; ownerId marks them as anonymous visitors of this share
    const owner = `share:${share.id}`;
    const created = await testAppService.createAnonymousSession(share.testAppId, v.id, owner, share.id, seed, SHARE_SESSION_TTL_MS);
    return created;
  },

  async loadSession(token: string, unlock: string | undefined, sessionId: string) {
    const share = await shareService.resolve(token);
    shareService.assertUnlocked(share, unlock);
    const s = await prisma.testAppSession.findUnique({ where: { id: sessionId } });
    if (!s || s.shareId !== share.id || s.expiresAt < new Date()) throw NotFound('Session not found');
    const app = await prisma.testApp.findUniqueOrThrow({ where: { id: share.testAppId } });
    return { share, app, s };
  },

  async invoke(token: string, unlock: string | undefined, sessionId: string, input: z.infer<typeof publicInvokeSchema>) {
    const { share, app, s } = await shareService.loadSession(token, unlock, sessionId);
    const used = await prisma.testAppShare.updateMany({ where: { id: share.id, requestCount: { lt: share.requestQuota } }, data: { requestCount: { increment: 1 } } });
    if (!used.count) throw new HttpError(429, 'The request quota of this shared link is used up.');
    // visitors can only run mapped actions; raw endpoints/paths/bodies are not accepted
    return testAppService.invokeOnSession(app, s, { actionId: input.actionId, values: input.values, scenario: input.scenario });
  },

  async reset(token: string, unlock: string | undefined, sessionId: string) {
    const { app, s } = await shareService.loadSession(token, unlock, sessionId);
    return testAppService.resetSession(app, s);
  },
};

function shareView(s: TestAppShare) {
  return { id: s.id, versionId: s.versionId, hasPassword: !!s.passwordHash, expiresAt: s.expiresAt, revokedAt: s.revokedAt, maxSessions: s.maxSessions, requestQuota: s.requestQuota, requestCount: s.requestCount, createdAt: s.createdAt };
}
