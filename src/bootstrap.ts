import bcrypt from 'bcryptjs';
import { env } from './config/env';
import { prisma } from './core/database/prisma';
import { pruneIdempotencyRecords } from './core/middleware/idempotency.middleware';
import { workspaceService } from './modules/workspaces/workspace.service';

/** Makes sure the ADMIN_EMAIL account exists and is a super admin. */
async function ensureAdmin() {
  if (!env.adminEmail) return;
  const existing = await prisma.user.findUnique({ where: { email: env.adminEmail } });
  if (existing) {
    if (existing.role !== 'admin') await prisma.user.update({ where: { id: existing.id }, data: { role: 'admin' } });
    return;
  }
  if (!env.adminPassword) return console.warn('ADMIN_EMAIL is set but ADMIN_PASSWORD is empty; admin not created');
  const admin = await prisma.user.create({
    data: { email: env.adminEmail, name: 'Administrator', role: 'admin', passwordHash: await bcrypt.hash(env.adminPassword, 10), settings: {} },
  });
  await workspaceService.createPersonal(admin.id);
  console.log(`Super admin created: ${env.adminEmail}`);
}

export async function bootstrap() {
  await ensureAdmin();
  await pruneIdempotencyRecords();
  setInterval(() => pruneIdempotencyRecords().catch(() => undefined), 24 * 3600 * 1000).unref();
}
