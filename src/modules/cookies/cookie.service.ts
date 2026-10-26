import { prisma } from '../../core/database/prisma';
import { BadRequest } from '../../core/errors/http-error';
// postman-runtime ships its own tough-cookie fork; using the same one keeps the requester compatible with our jar.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { CookieJar, Cookie } = require('@postman/tough-cookie');

export type Jar = any;

export interface CookieView {
  name: string;
  value: string;
  domain: string;
  path: string;
  expires: string | null;
  httpOnly: boolean;
  secure: boolean;
  raw: string;
}

export const cookieService = {
  async load(userId: string): Promise<Jar> {
    const row = await prisma.cookieJar.findUnique({ where: { userId } });
    if (row?.data) {
      try {
        return CookieJar.deserializeSync(JSON.parse(row.data));
      } catch {
        /* corrupted jar: start fresh */
      }
    }
    return new CookieJar(undefined, { looseMode: true });
  },

  async save(userId: string, jar: Jar) {
    const data = JSON.stringify(jar.serializeSync());
    await prisma.cookieJar.upsert({ where: { userId }, create: { userId, data }, update: { data } });
  },

  /** Cookies grouped by domain, as the Postman cookie manager shows them. */
  list(jar: Jar): { domain: string; cookies: CookieView[] }[] {
    const byDomain = new Map<string, CookieView[]>();
    (jar.serializeSync().cookies || []).forEach((c: any) => {
      const cookie = Cookie.fromJSON(c);
      const list = byDomain.get(c.domain) || [];
      list.push({
        name: c.key,
        value: c.value,
        domain: c.domain,
        path: c.path || '/',
        expires: c.expires && c.expires !== 'Infinity' ? c.expires : null,
        httpOnly: !!c.httpOnly,
        secure: !!c.secure,
        raw: cookie ? cookie.toString() : `${c.key}=${c.value}`,
      });
      byDomain.set(c.domain, list);
    });
    return Array.from(byDomain, ([domain, cookies]) => ({ domain, cookies })).sort((a, b) => a.domain.localeCompare(b.domain));
  },

  async getAll(userId: string) {
    return this.list(await this.load(userId));
  },

  /** Adds or replaces a cookie from a raw `name=value; Path=/; ...` string. */
  async upsertRaw(userId: string, domain: string, raw?: string) {
    const jar = await this.load(userId);
    const cookie = Cookie.parse(raw || `Cookie_1=value; Path=/; Domain=${domain}`, { loose: true });
    if (!cookie) throw BadRequest('Invalid cookie string');
    if (!cookie.domain) cookie.domain = domain.replace(/^\./, '');
    const host = cookie.domain.replace(/^\./, '');
    jar.setCookieSync(cookie, `${cookie.secure ? 'https' : 'http'}://${host}${cookie.path || '/'}`, { ignoreError: true });
    await this.save(userId, jar);
    return this.list(jar);
  },

  /** Removes one cookie, or the whole domain when no name is given. */
  async remove(userId: string, domain: string, name?: string, path = '/') {
    const jar = await this.load(userId);
    if (name) jar.store.removeCookie(domain, path, name, () => undefined);
    else jar.store.removeCookies(domain, null, () => undefined);
    await this.save(userId, jar);
    return this.list(jar);
  },

  async clear(userId: string) {
    const jar = await this.load(userId);
    jar.removeAllCookiesSync();
    await this.save(userId, jar);
  },
};
