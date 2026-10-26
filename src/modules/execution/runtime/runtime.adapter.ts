import fs from 'fs';
import { randomUUID } from 'crypto';
import { ScopeValue } from '../../../shared/postman/variables';
import { errorText, itemPath, serializeRequest, serializeResponse } from './serializers';
import { ConsoleEntry, Execution, RunInput, RunResult, RunStats } from './runtime.types';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const runtime = require('postman-runtime');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk = require('postman-collection');

const SCRIPT_TIMEOUT_MS = 60_000;

const toScope = (values: ScopeValue[] = []) =>
  new sdk.VariableScope({ values: values.map((v) => ({ key: v.key, value: v.value, type: v.type || 'any' })) });

function fromScope(scope: any): ScopeValue[] {
  const out: ScopeValue[] = [];
  scope?.values.each((v: any) => !v.disabled && out.push({ key: v.key, value: v.value }));
  return out;
}

function buildEntrypoint(entrypoint: RunInput['entrypoint']) {
  if (Array.isArray(entrypoint)) return { execute: entrypoint, lookupStrategy: 'multipleIdOrName', preserveOrder: true };
  if (entrypoint) return { execute: entrypoint, lookupStrategy: 'idOrName' };
  return undefined;
}

function computeStats(executions: Execution[], iterations: number, startedAt: number): RunStats {
  const tests = executions.flatMap((e) => e.tests);
  return {
    iterations,
    requests: executions.filter((e) => e.request).length,
    testsPassed: tests.filter((t) => t.passed).length,
    testsFailed: tests.filter((t) => !t.passed && !t.skipped).length,
    testsSkipped: tests.filter((t) => t.skipped).length,
    totalTime: Date.now() - startedAt,
  };
}

/**
 * Executes a collection (or part of it) with postman-runtime — the engine behind Postman and Newman —
 * so scripts (`pm.*`), auth helpers, dynamic variables, cookies and timings behave exactly like Postman.
 */
export function runCollection(input: RunInput): Promise<RunResult> {
  const startedAt = Date.now();
  const settings = input.settings || {};
  const iterations = Math.max(input.iterationCount || input.data?.length || 1, 1);
  const emit = input.onEvent || (() => undefined);
  const environment = toScope(input.environment);
  const globals = toScope(input.globals);

  const executions = new Map<string, Execution>();
  const consoleEntries: ConsoleEntry[] = [];

  const executionFor = (cursor: any, item: any): Execution => {
    const key = `${cursor.iteration}:${cursor.ref}`;
    let execution = executions.get(key);
    if (!execution) {
      execution = {
        id: randomUUID(),
        itemId: item?.id,
        name: item?.name,
        iteration: cursor.iteration,
        path: itemPath(item),
        request: null,
        response: null,
        error: null,
        tests: [],
        prerequestError: null,
        testError: null,
        visualizer: null,
      };
      executions.set(key, execution);
    }
    return execution;
  };
  const scriptError = (err: unknown, results: any[]) => errorText(err || (results || []).find((r) => r?.error)?.error);

  return new Promise((resolve) => {
    new runtime.Runner().run(
      new sdk.Collection(input.collection),
      {
        environment,
        globals,
        entrypoint: buildEntrypoint(input.entrypoint),
        data: input.data?.length ? input.data : undefined,
        iterationCount: iterations,
        delay: { item: input.delay || 0 },
        timeout: { request: settings.timeout || Infinity, script: SCRIPT_TIMEOUT_MS },
        abortOnFailure: !!input.bail,
        fileResolver: fs,
        network: settings.restrictedAddresses ? { restrictedAddresses: settings.restrictedAddresses } : {},
        requester: {
          strictSSL: settings.strictSSL !== false,
          followRedirects: settings.followRedirects !== false,
          cookieJar: settings.disableCookies ? undefined : input.cookieJar,
          timings: true,
          maxResponseSize: settings.maxResponseSize ? settings.maxResponseSize * 1024 * 1024 : undefined,
        },
      },
      (err: unknown, run: any) => {
        if (err) {
          return resolve({
            executions: [],
            console: [],
            environment: fromScope(environment),
            globals: fromScope(globals),
            collectionVariables: [],
            error: errorText(err),
            stats: computeStats([], 0, startedAt),
          });
        }
        const itemAt = (cursor: any) => run.state.items?.[cursor?.position];
        input.registerAbort?.(() => run.abort());

        run.start({
          beforeItem(_err: unknown, cursor: any, item: any) {
            const { id, itemId, name, iteration, path } = executionFor(cursor, item);
            emit('beforeItem', { id, itemId, name, iteration, path });
          },
          prerequest(err: unknown, cursor: any, results: any[], item: any) {
            executionFor(cursor, item).prerequestError = scriptError(err, results);
          },
          request(err: unknown, cursor: any, response: any, request: any, item: any, cookies: any[], history: any) {
            const execution = executionFor(cursor, item);
            execution.request = serializeRequest(request, history);
            execution.response = serializeResponse(response, history, cookies);
            execution.error = errorText(err);
          },
          test(err: unknown, cursor: any, results: any[], item: any) {
            executionFor(cursor, item).testError = scriptError(err, results);
          },
          assertion(cursor: any, assertions: any[]) {
            const execution = executionFor(cursor, itemAt(cursor));
            (assertions || []).forEach((a) =>
              execution.tests.push({ name: a.name, passed: !!a.passed && !a.skipped, skipped: !!a.skipped, error: errorText(a.error) }),
            );
          },
          console(cursor: any, level: string, ...messages: unknown[]) {
            const entry = { level, messages, itemId: itemAt(cursor)?.id, time: Date.now() };
            consoleEntries.push(entry);
            emit('console', entry);
          },
          item(err: unknown, cursor: any, item: any, visualizer: any, result: any) {
            const execution = executionFor(cursor, item);
            if (visualizer) execution.visualizer = { html: visualizer.processedTemplate, error: errorText(visualizer.error), data: visualizer.data };
            if (result?.isSkipped) execution.skipped = true;
            if (err && !execution.error) execution.error = errorText(err);
            emit('item', execution);
          },
          exception(_cursor: any, err: unknown) {
            consoleEntries.push({ level: 'error', messages: [errorText(err)], time: Date.now() });
          },
          done(err: unknown) {
            const ran = Array.from(executions.values()).filter((e) => e.request || e.error || e.prerequestError || e.skipped);
            resolve({
              executions: ran,
              console: consoleEntries,
              environment: fromScope(run.state.environment),
              globals: fromScope(run.state.globals),
              collectionVariables: fromScope(run.state.collectionVariables),
              error: errorText(err),
              stats: computeStats(ran, iterations, startedAt),
            });
          },
        });
      },
    );
  });
}
