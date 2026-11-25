import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { env } from '../../config/env';

/** Encrypts small secrets (user API keys) at rest: AES-256-GCM, key derived from the server secret. Format `v1.iv.tag.data` (base64url). */
const keyOf = (secret: string) => createHash('sha256').update(`fack-postman:secret-box:${secret}`).digest();

export function seal(plain: string, secret: string = env.jwtSecret): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', keyOf(secret), iv);
  const data = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
  return ['v1', iv.toString('base64url'), c.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

export function unseal(sealed: string, secret: string = env.jwtSecret): string {
  const [v, iv, tag, data] = sealed.split('.');
  if (v !== 'v1' || !iv || !tag || !data) throw new Error('Unreadable secret');
  const d = createDecipheriv('aes-256-gcm', keyOf(secret), Buffer.from(iv, 'base64url'));
  d.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
}
