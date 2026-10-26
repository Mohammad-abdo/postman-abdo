import { randomUUID } from 'crypto';
import { prisma, json } from '../../core/database/prisma';
import { requestToV21Item } from '../../shared/postman/request.mapper';
import { RequestModel } from '../../shared/postman/types';
import { authService } from '../auth/auth.service';
import { assertCollectionAccess } from '../collections/collection.access';
import { collectionService } from '../collections/collection.service';
import { cookieService } from '../cookies/cookie.service';
import { historyService } from '../history/history.service';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { RunCollectionInput, SendRequestInput } from './execution.schema';
import { runCollection } from './runtime/runtime.adapter';
import { RunSettings, RuntimeEvent } from './runtime/runtime.types';
import { stripBody } from './runtime/serializers';
import { loadScopes, persistScopes, runtimeValues } from './variable-scopes';

/** Request-level settings override the user's global settings (Settings → General). */
function resolveSettings(user: Record<string, any>, request: Record<string, any> = {}): RunSettings {
  return {
    strictSSL: request.strictSSL ?? user.sslVerification !== false,
    followRedirects: request.followRedirects ?? user.followRedirects !== false,
    timeout: Number(user.requestTimeout) || 0,
    maxResponseSize: Number(user.maxResponseSize) || 0,
    disableCookies: !!request.disableCookies,
  };
}

export interface RunHooks {
  onEvent: (event: RuntimeEvent | 'start', payload: unknown) => void;
  registerAbort: (abort: () => void) => void;
}

export const executionService = {
  /** The "Send" button: runs one (possibly unsaved) request with its collection's scripts, auth and variables. */
  async send(userId: string, input: SendRequestInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    const draft = { ...input.request, id: input.request.id || randomUUID() } as RequestModel;
    const collectionId = input.request.collectionId || null;
    if (collectionId) await assertCollectionAccess(userId, collectionId);

    const collection = collectionId
      ? await collectionService.toPostman(collectionId, { forRun: true, draft, useCurrentValues: true })
      : { info: { name: 'Scratch Pad' }, item: [requestToV21Item(draft, { forRun: true })] };

    const scopes = await loadScopes(input.workspaceId, input.environmentId);
    const jar = await cookieService.load(userId);
    const result = await runCollection({
      collection,
      entrypoint: draft.id,
      ...runtimeValues(scopes),
      settings: resolveSettings(await authService.settings(userId), input.request.settings),
      cookieJar: jar,
    });
    await cookieService.save(userId, jar);
    const variableUpdates = await persistScopes(result, scopes, collectionId);

    const execution = result.executions[result.executions.length - 1] || null;
    const history =
      execution && (execution.request || execution.error)
        ? await historyService.record({
            workspaceId: input.workspaceId,
            userId,
            request: input.request,
            response: execution.response
              ? { code: execution.response.code, status: execution.response.status, time: execution.response.responseTime, size: execution.response.size.total }
              : { error: execution.error },
          })
        : null;

    return { execution, console: result.console, error: result.error, variableUpdates, history };
  },

  /** Collection Runner; progress is reported through hooks.onEvent. */
  async run(userId: string, input: RunCollectionInput, hooks: RunHooks) {
    await assertWorkspaceMember(userId, input.workspaceId);
    const collection = await assertCollectionAccess(userId, input.collectionId);
    const scopes = await loadScopes(input.workspaceId, input.environmentId);
    const jar = await cookieService.load(userId);
    const hasData = !!input.data?.length;
    let aborted = false;

    hooks.onEvent('start', { collection: collection.name, iterations: input.iterations });
    const result = await runCollection({
      collection: await collectionService.toPostman(input.collectionId, { forRun: true, useCurrentValues: true }),
      entrypoint: input.requestIds?.length ? input.requestIds : input.folderId || undefined,
      ...runtimeValues(scopes),
      data: hasData ? input.data : undefined,
      iterationCount: input.iterations,
      delay: input.delay,
      bail: input.bail,
      settings: { ...resolveSettings(await authService.settings(userId)), disableCookies: input.disableCookies },
      cookieJar: input.disableCookies ? undefined : jar,
      registerAbort: (abort) =>
        hooks.registerAbort(() => {
          aborted = true;
          abort();
        }),
      onEvent: (event, payload: any) => hooks.onEvent(event, event === 'item' && !input.persistResponses ? stripBody(payload) : payload),
    });

    if (input.saveCookies && !input.disableCookies) await cookieService.save(userId, jar);
    const variableUpdates = input.persistVariables ? await persistScopes(result, scopes, input.collectionId) : {};

    const saved = await prisma.collectionRun.create({
      data: {
        workspaceId: input.workspaceId,
        collectionId: input.collectionId,
        source: 'runner',
        name: collection.name,
        stats: { ...result.stats, aborted, environmentId: input.environmentId || null },
        results: json(result.executions.map((e) => ({ ...(input.persistResponses ? e : stripBody(e)), visualizer: null }))),
      },
    });
    return { runId: saved.id, stats: result.stats, error: result.error, aborted, variableUpdates };
  },
};
