import { prisma } from '../../core/database/prisma';
import { BadRequest } from '../../core/errors/http-error';
import { isInheritedAuth } from '../../shared/postman/auth.mapper';
import { requestToV21Item } from '../../shared/postman/request.mapper';
import { AuthModel, RequestModel } from '../../shared/postman/types';
import { scopeValues } from '../../shared/postman/variables';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { GenerateSnippetInput } from './codegen.schema';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const codegen = require('postman-code-generators');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk = require('postman-collection');

/** Walks request → parent folders → collection to find the auth that actually applies. */
async function effectiveAuth(request: RequestModel): Promise<AuthModel> {
  if (!isInheritedAuth(request.auth)) return request.auth!;
  let folderId = request.folderId;
  while (folderId) {
    const folder = await prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder) break;
    if (!isInheritedAuth(folder.auth as AuthModel)) return folder.auth as AuthModel;
    folderId = folder.parentId;
  }
  if (request.collectionId) {
    const collection = await prisma.collection.findUnique({ where: { id: request.collectionId } });
    if (!isInheritedAuth(collection?.auth as AuthModel)) return collection!.auth as AuthModel;
  }
  return { type: 'noauth' };
}

/** Variable resolution order: globals < collection < environment. */
async function variableScope(workspaceId: string, environmentId?: string | null, collectionId?: string | null) {
  const [globals, collection, environment] = await Promise.all([
    prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } }),
    collectionId ? prisma.collection.findUnique({ where: { id: collectionId } }) : null,
    environmentId ? prisma.environment.findFirst({ where: { id: environmentId, workspaceId } }) : null,
  ]);
  const merged = new Map<string, unknown>();
  [globals?.variables, collection?.variables, environment?.variables].forEach((vars) =>
    scopeValues(vars).forEach((v) => merged.set(v.key, v.value)),
  );
  return new sdk.VariableScope({ values: Array.from(merged, ([key, value]) => ({ key, value })) });
}

/** Code generators don't sign requests, so add the simple auth headers like Postman's snippet view does. */
function applySimpleAuth(sdkRequest: any, auth: AuthModel, resolve: (s: unknown) => string) {
  const params = auth[auth.type] || {};
  switch (auth.type) {
    case 'basic':
      sdkRequest.headers.upsert({
        key: 'Authorization',
        value: 'Basic ' + Buffer.from(`${resolve(params.username)}:${resolve(params.password)}`).toString('base64'),
      });
      break;
    case 'bearer':
      sdkRequest.headers.upsert({ key: 'Authorization', value: `Bearer ${resolve(params.token)}` });
      break;
    case 'apikey':
      if (!params.key) break;
      if (params.in === 'query') sdkRequest.url.query.add({ key: resolve(params.key), value: resolve(params.value) });
      else sdkRequest.headers.upsert({ key: resolve(params.key), value: resolve(params.value) });
      break;
    case 'oauth2':
      if (params.accessToken) {
        sdkRequest.headers.upsert({ key: 'Authorization', value: `${params.headerPrefix || 'Bearer'} ${resolve(params.accessToken)}` });
      }
      break;
  }
}

export const codegenService = {
  languages() {
    return codegen.getLanguageList().map((l: any) => ({
      key: l.key,
      label: l.label,
      syntaxMode: l.syntax_mode,
      variants: l.variants.map((v: any) => v.key),
    }));
  },

  async generate(userId: string, input: GenerateSnippetInput): Promise<string> {
    await assertWorkspaceMember(userId, input.workspaceId);
    const request = input.request as unknown as RequestModel;
    const auth = await effectiveAuth(request);
    const scope = await variableScope(input.workspaceId, input.environmentId, request.collectionId);
    const resolve = (s: unknown) => scope.replaceIn(String(s ?? ''));

    const item = requestToV21Item({ ...request, auth });
    const sdkRequest = new sdk.Request(scope.replaceIn(item.request));
    applySimpleAuth(sdkRequest, auth, resolve);

    return new Promise((resolvePromise, reject) =>
      codegen.convert(input.language, input.variant, sdkRequest, input.options, (err: Error | null, snippet: string) =>
        err ? reject(BadRequest(err.message)) : resolvePromise(snippet),
      ),
    );
  },
};
