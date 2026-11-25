/**
 * Re-encrypts every stored API key with the current SECRETS_KEY.
 * Rotation: put the old key in SECRETS_KEY_PREVIOUS, set the new SECRETS_KEY, run `npm run secrets:rotate`, then drop the old key.
 */
import { prisma } from '../src/core/database/prisma';
import { seal, unsealWithMeta } from '../src/core/security/secret-box';

async function main() {
  const rows = await prisma.userApiKey.findMany({ select: { id: true, secret: true, label: true } });
  let moved = 0;
  let current = 0;
  const failed: string[] = [];
  for (const r of rows) {
    try {
      const { plain, current: isCurrent } = unsealWithMeta(r.secret);
      if (isCurrent) current++;
      else {
        await prisma.userApiKey.update({ where: { id: r.id }, data: { secret: seal(plain) } });
        moved++;
      }
    } catch {
      failed.push(r.id);
    }
  }
  console.log(`keys: ${rows.length}, already current: ${current}, re-encrypted: ${moved}, unreadable: ${failed.length}`);
  if (failed.length) console.log('Unreadable (their owners must add them again):', failed.join(', '));
  await prisma.$disconnect();
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
