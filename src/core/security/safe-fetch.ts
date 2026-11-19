import dns from 'dns/promises';
import net from 'net';
import { env } from '../../config/env';
import { BadRequest } from '../errors/http-error';
import { PRIVATE_NETWORKS } from './security.middleware';

const MAX_REDIRECTS = 3;
const TIMEOUT_MS = 10_000;
const MAX_BYTES = 25 * 1024 * 1024;

const blocked = new net.BlockList();
for (const cidr of Object.keys(PRIVATE_NETWORKS)) {
  const [addr, prefix] = cidr.split('/');
  if (!prefix) continue;
  blocked.addSubnet(addr, Number(prefix), net.isIPv6(addr) ? 'ipv6' : 'ipv4');
}

function isBlockedIp(ip: string) {
  const family = net.isIPv6(ip) ? 'ipv6' : 'ipv4';
  // IPv4-mapped IPv6 (::ffff:127.0.0.1) must be checked as IPv4.
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return blocked.check(mapped[1], 'ipv4');
  return blocked.check(ip, family);
}

/** Throws unless the URL is http(s) and (when SSRF protection is on) resolves only to public addresses. */
async function assertPublicUrl(raw: string) {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw BadRequest('Invalid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') throw BadRequest('Only http and https URLs can be fetched');
  if (!env.blockPrivateNetworks) return url;

  const host = url.hostname.replace(/^\[|\]$/g, '');
  if (host.toLowerCase() === 'localhost' || host.toLowerCase().endsWith('.localhost')) throw BadRequest('This address is not allowed');
  const addresses = net.isIP(host) ? [{ address: host }] : await dns.lookup(host, { all: true }).catch(() => []);
  if (!addresses.length) throw BadRequest('Could not resolve host');
  if (addresses.some((a) => isBlockedIp(a.address))) throw BadRequest('This address is not allowed');
  return url;
}

/**
 * Fetches text from a user-supplied URL with SSRF protection: scheme check, DNS resolution check,
 * redirects followed manually (each hop re-checked), timeout and size cap.
 * Known limit: DNS is resolved again by fetch(), so a rebinding race is not fully closed.
 */
export async function safeFetchText(rawUrl: string): Promise<string> {
  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const response = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) }).catch(() => {
      throw BadRequest(`Could not fetch ${url.origin}`);
    });
    if (response.status >= 300 && response.status < 400 && response.headers.get('location')) {
      current = new URL(response.headers.get('location') as string, url).toString();
      continue;
    }
    if (!response.ok) throw BadRequest(`Could not fetch ${url.origin} (${response.status})`);
    const length = Number(response.headers.get('content-length') || 0);
    if (length > MAX_BYTES) throw BadRequest('The file is too large');
    const text = await response.text();
    if (text.length > MAX_BYTES) throw BadRequest('The file is too large');
    return text;
  }
  throw BadRequest('Too many redirects');
}
