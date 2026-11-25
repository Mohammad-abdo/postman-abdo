import { env } from '../../config/env';
import { TestApp } from '@prisma/client';
import { prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden } from '../../core/errors/http-error';
import { PRIVATE_NETWORKS } from '../../core/security/security.middleware';
import { RequestModel } from '../../shared/postman/types';
import { requestToV21Item } from '../../shared/postman/request.mapper';
import { scopeValues } from '../../shared/postman/variables';
import { Endpoint } from '../../shared/testapp/types';
import { BuiltRequest, RealSettings, buildRealRequest, gateRequest, parseBody, redactHeaders } from '../../shared/testapp/real';
import { isObj } from '../../shared/testapp/util';
import { collectionService } from '../collections/collection.service';
import { runCollection } from '../execution/runtime/runtime.adapter';
import { loadScopes, runtimeValues } from '../execution/variable-scopes';
import { isFreeRepeat, limitsService } from '../platform/limits.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';

export const REAL_LIMITS = { timeoutMs: 15_000, maxResponseMb: 2, maxEndpointsPerRun: 40, runBudgetMs: 120_000, maxBodyChars: 256 * 1024 };

/** Never reachable, even on a developer machine: cloud metadata and link-local ranges. */
const ALWAYS_BLOCKED: Record<string, boolean> = { '0.0.0.0/8': true, '169.254.0.0/16': true, 'fe80::/10': true };

/** Turns a low-level network failure into something a person can act on. */
export function explainNetworkError(raw: string, url: string) {
  let host = url;
  try {
    const u = new URL(url);
    host = u.host;
  } catch {
    /* keep the raw url */
  }
  const local = /^(localhost|127\.|0\.0\.0\.0|\[::1\])/i.test(host);
  if (/ECONNREFUSED/i.test(raw)) return `Nothing is listening at ${host}. Start your backend (or fix the baseUrl variable) and try again.${local ? ' Real API requests are sent from the Fack Postman server, so "localhost" means the machine the server runs on.' : ''}`;
  if (/ENOTFOUND|EAI_AGAIN/i.test(raw)) return local && env.blockPrivateNetworks ? `${host} is a private address. This server blocks private networks (BLOCK_PRIVATE_NETWORKS), so it cannot call it. Use a public URL, or run the server on your own machine with BLOCK_PRIVATE_NETWORKS=false.` : `The server could not find the host ${host}. Check the baseUrl variable for a typo.`;
  if (/ETIMEDOUT|ESOCKETTIMEDOUT|timeout/i.test(raw)) return `${host} did not answer within ${REAL_LIMITS.timeoutMs / 1000} seconds.`;
  if (/restricted|not allowed|blocked/i.test(raw)) return `The address ${host} is blocked from this server. Private networks are only reachable when BLOCK_PRIVATE_NETWORKS=false.`;
  if (/CERT|SSL|TLS/i.test(raw)) return `The secure connection to ${host} failed (${raw.replace(/^NETERR:\s*/, '').slice(0, 120)}).`;
  return raw.replace(/^NETERR:\s*/, '');
}

export const realSettingsOf = (app: TestApp): RealSettings => {
  const s = (isObj(app.settings) ? app.settings : {}) as { real?: RealSettings };
  return s.real || {};
};

export type RealOutcome =
  | { kind: 'ok'; status: number; headers: Record<string, string>; body: unknown; ms: number; url: string }
  | { kind: 'blocked' | 'skipped' | 'error'; reason: string };

export interface RealContext {
  scopes: Awaited<ReturnType<typeof loadScopes>>;
  vars: Map<string, string>;
  collection: any;
  environmentStage: string | null;
  isAdmin: boolean;
}

export async function loadRealContext(userId: string, app: TestApp): Promise<RealContext> {
  const settings = realSettingsOf(app);
  const member = await assertWorkspaceMember(userId, app.workspaceId);
  if (member.role === 'viewer') throw Forbidden('Viewers cannot run Real API tests');
  const scopes = await loadScopes(app.workspaceId, settings.environmentId);
  const collection = await collectionService.toPostman(app.collectionId, { forRun: true, useCurrentValues: true });
  const vars = new Map<string, string>();
  [scopes.globals.variables, collection.variable, scopes.environment?.variables].forEach((list) => scopeValues(list as never).forEach((v) => vars.set(v.key, String(v.value))));
  return { scopes, vars, collection, environmentStage: scopes.environment?.stage || null, isAdmin: member.role === 'admin' };
}

export function assertRealEnabled(app: TestApp) {
  const s = realSettingsOf(app);
  if (!s.enabled || !s.allowedHosts?.length) throw BadRequest('Enable Real API mode and add at least one allowed host in the test app settings first.');
}

/**
 * Executes ONE endpoint against the real backend through the existing postman-runtime executor.
 * Safeguards, all enforced here: host allowlist, SSRF address block (always on), method gating, production block,
 * no redirects, scripts off unless enabled, timeout, response-size cap, daily request quota.
 * Never reachable from public share links.
 */
function folderAuth(items: any[], requestId: string, inherited?: unknown): unknown {
  for (const item of items) {
    if (item.id === requestId && item.request) return inherited;
    if (Array.isArray(item.item)) {
      const auth = folderAuth(item.item, requestId, item.auth ?? inherited);
      if (auth !== undefined) return auth;
    }
  }
  return undefined;
}

export async function executeReal(args: {
  userId: string;
  app: TestApp;
  endpoint: Endpoint;
  values?: { pathParams?: Record<string, string>; query?: Record<string, string>; queryEntries?: [string, string][]; body?: unknown; headers?: Record<string, string>; rawBody?: boolean; form?: Record<string, unknown> };
  confirmUnsafe?: boolean;
  confirmProduction?: boolean;
  context?: RealContext;
}): Promise<RealOutcome> {
  const { app, endpoint } = args;
  const settings = realSettingsOf(app);
  const ctx = args.context || (await loadRealContext(args.userId, app));
  const built: BuiltRequest = buildRealRequest(endpoint, args.values || {}, settings, (n) => ctx.vars.get(n));
  if (built.missing.length) return { kind: 'skipped', reason: `No value for ${built.missing.join(', ')} (add an example value in the collection)` };

  const gate = gateRequest({ method: built.method, url: built.url, settings, confirmUnsafe: args.confirmUnsafe, confirmProduction: args.confirmProduction, environmentStage: ctx.environmentStage, isWorkspaceAdmin: ctx.isAdmin });
  if (!gate.ok) return { kind: 'blocked', reason: gate.reason };

  const row = await prisma.request.findUnique({ where: { id: endpoint.id } });
  if (!row || row.collectionId !== app.collectionId) return { kind: 'skipped', reason: 'The request no longer exists in the collection' };

  if (!isFreeRepeat(args.userId, built.method, built.url)) await limitsService.consumeRequests(args.userId, 1);
  const item = requestToV21Item({ ...(row as unknown as RequestModel), examples: [] }, { forRun: true });
  const inheritedAuth = folderAuth(ctx.collection.item || [], item.id);
  if (!item.request.auth && inheritedAuth !== undefined) item.request.auth = inheritedAuth;
  item.request.url = built.url; // string form: postman-runtime parses it itself
  const hasJsonBody = isObj(built.body) && built.method !== 'GET' && built.method !== 'HEAD';
  if (hasJsonBody && (!item.request.body || item.request.body.mode === 'raw')) {
    item.request.body = { mode: 'raw', raw: JSON.stringify(built.body), options: { raw: { language: 'json' } } };
    const headers: { key: string; value: string }[] = item.request.header || (item.request.header = []);
    if (!headers.some((h) => /^content-type$/i.test(h.key))) headers.push({ key: 'Content-Type', value: 'application/json' });
  }
  if (args.values?.rawBody && item.request.body?.mode === 'raw') {
    item.request.body.raw = String(args.values.body ?? '');
  }
  const form = args.values?.form;
  const requestBody = item.request.body;
  if (form && requestBody?.mode === 'urlencoded') {
    for (const field of requestBody.urlencoded || []) {
      if (Object.hasOwn(form, field.key)) field.value = String(form[field.key]);
    }
  }
  if (form && requestBody?.mode === 'formdata') {
    for (const field of requestBody.formdata || []) {
      if (field.type !== 'file' && Object.hasOwn(form, field.key)) field.value = String(form[field.key]);
    }
  }
  for (const [name, value] of Object.entries(args.values?.headers || {})) {
    if (/^(host|:|connection|content-length|transfer-encoding|upgrade|proxy-)/i.test(name)) continue;
    const headers = item.request.header || (item.request.header = []);
    const existing = headers.find((header: { key: string }) => header.key.toLowerCase() === name.toLowerCase());
    if (existing) existing.value = value;
    else headers.push({ key: name, value });
  }
  if (!settings.runScripts) delete item.event;

  const collection = { ...ctx.collection, item: [item] };
  if (!settings.runScripts) delete collection.event;

  const result = await runCollection({
    collection,
    entrypoint: item.id,
    ...runtimeValues(ctx.scopes),
    settings: {
      // hosted servers (BLOCK_PRIVATE_NETWORKS on) never reach private networks; on your own machine localhost and your LAN work, but cloud-metadata ranges stay blocked
      restrictedAddresses: env.blockPrivateNetworks ? PRIVATE_NETWORKS : ALWAYS_BLOCKED,
      timeout: REAL_LIMITS.timeoutMs,
      maxResponseSize: REAL_LIMITS.maxResponseMb,
      strictSSL: true,
      followRedirects: false, // a redirect could leave the allowlist
      disableCookies: true,
    },
  });
  const execution = result.executions[0];
  if (!execution?.response) return { kind: 'error', reason: explainNetworkError(execution?.error || result.error || 'No response received', built.url) };
  const text = String(execution.response.body || '').slice(0, REAL_LIMITS.maxBodyChars);
  return {
    kind: 'ok',
    status: execution.response.code,
    headers: redactHeaders(Object.fromEntries(execution.response.headers.map((h) => [h.key, h.value]))),
    body: parseBody(text),
    ms: execution.response.responseTime,
    url: built.url.replace(/\?.*$/, ''), // query strings can carry secrets; keep only the path in evidence
  };
}
