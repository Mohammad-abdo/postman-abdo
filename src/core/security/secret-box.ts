import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';

/**
 * Encrypts small secrets (user API keys) at rest: AES-256-GCM. Format `v1.iv.tag.data` (base64url).
 * New secrets use SECRETS_KEY. Reading also tries SECRETS_KEY_PREVIOUS and the old JWT_SECRET, so rotating a key never loses data:
 * `unsealWithMeta` says whether the current key was enough, and callers re-encrypt when it was not.
 */
const keyOf = (secret: string) => createHash('sha256').update(`fack-postman:secret-box:${secret}`).digest();

export function seal(plain: string, secret: string = env.secretsKey): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function open(sealed: string, secret: string): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}

/** Decrypts with an explicit secret only (tests, tools). */
export function unseal(sealed: string, secret: string = env.secretsKey): string {
  return open(sealed, secret);
}

/** Decrypts with the current key, then the previous ones. `current` is false when an older key was needed, so the caller should re-seal. */
export function unsealWithMeta(sealed: string, keys: string[] = [env.secretsKey, ...env.secretsKeyPrevious, env.jwtSecret]): { plain: string; current: boolean } {
  const unique = [...new Set(keys)];
  let last: unknown;
  for (const [i, k] of unique.entries()) {
    try {
      return { plain: open(sealed, k), current: i === 0 };
    } catch (e) {
      last = e;
    }
  }
  throw last instanceof Error ? last : new Error('Unreadable secret');
}
