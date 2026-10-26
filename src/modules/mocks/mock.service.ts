import crypto from 'crypto';
import { prisma } from '../../core/database/prisma';
import { HttpError, NotFound } from '../../core/errors/http-error';
import { KeyValue } from '../../shared/postman/types';
import { scopeValues } from '../../shared/postman/variables';
import { assertCollectionAccess } from '../collections/collection.access';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { MockQuery, findBestMatch, replaceVariables } from './mock.matcher';
import { CreateMockInput, UpdateMockInput } from './mock.schema';

const newApiKey = () => 'PMAK-' + crypto.randomBytes(16).toString('hex');

const CONTENT_TYPES: Record<string, string> = {
  json: 'application/json',
  xml: 'application/xml',
  html: 'text/html',
};

async function assertMockAccess(userId: string, id: string) {
  const mock = await prisma.mockServer.findUnique({ where: { id } });
  if (!mock) throw NotFound('Mock server not found');
  await assertWorkspaceMember(userId, mock.workspaceId);
  return mock;
}

export interface MockResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
  delay: number;
}

export const mockService = {
  async list(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    return prisma.mockServer.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' } });
  },

  async create(userId: string, input: CreateMockInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    await assertCollectionAccess(userId, input.collectionId);
    return prisma.mockServer.create({
      data: { ...input, environmentId: input.environmentId || null, apiKey: input.isPrivate ? newApiKey() : null },
    });
  },

  async update(userId: string, id: string, input: UpdateMockInput) {
    const mock = await assertMockAccess(userId, id);
    const privacy = input.isPrivate === undefined ? {} : { isPrivate: input.isPrivate, apiKey: input.isPrivate ? mock.apiKey || newApiKey() : null };
    return prisma.mockServer.update({ where: { id }, data: { ...input, ...privacy } });
  },

  async remove(userId: string, id: string) {
    await assertMockAccess(userId, id);
    await prisma.mockServer.delete({ where: { id } });
  },

  /** Resolves an incoming mock call to the best matching saved example. */
  async respond(mockId: string, apiKey: string | undefined, query: MockQuery): Promise<MockResponse> {
    const mock = await prisma.mockServer.findUnique({ where: { id: mockId } });
    if (!mock) throw NotFound('Mock server not found');
    if (mock.isPrivate && apiKey !== mock.apiKey) throw new HttpError(401, 'API Key missing or invalid');

    const [collection, environment, examples] = await Promise.all([
      prisma.collection.findUnique({ where: { id: mock.collectionId } }),
      mock.environmentId ? prisma.environment.findUnique({ where: { id: mock.environmentId } }) : null,
      prisma.example.findMany({ where: { parent: { collectionId: mock.collectionId } }, include: { parent: true } }),
    ]);
    const vars = new Map<string, string>();
    [collection?.variables, environment?.variables].forEach((list) => scopeValues(list).forEach((v) => vars.set(v.key, String(v.value))));

    const candidates = examples.map((ex) => {
      const original = (ex.request as { method?: string; url?: string } | null) || {};
      return {
        ...ex,
        method: original.method || ex.parent.method,
        url: replaceVariables(original.url || ex.parent.url, vars),
      };
    });
    const match = findBestMatch(candidates, query);
    if (!match) throw NotFound('No matching requests. Double check your method and the request path and try again.');

    const headers: Record<string, string> = {};
    ((match.headers as unknown as KeyValue[]) || [])
      .filter((h) => h.enabled !== false && h.key && !/^(content-length|transfer-encoding|connection)$/i.test(h.key))
      .forEach((h) => (headers[h.key] = replaceVariables(String(h.value), vars)));
    if (!Object.keys(headers).some((k) => k.toLowerCase() === 'content-type')) {
      headers['Content-Type'] = CONTENT_TYPES[match.language] || 'text/plain';
    }
    headers['x-srv-trace'] = `mock:${mock.id}`;
    return { status: match.code || 200, headers, body: replaceVariables(match.body || '', vars), delay: mock.delay };
  },
};
