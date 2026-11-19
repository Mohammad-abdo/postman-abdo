"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.runCollection = runCollection;
const fs_1 = __importDefault(require("fs"));
const crypto_1 = require("crypto");
const serializers_1 = require("./serializers");
// eslint-disable-next-line @typescript-eslint/no-var-requires
const runtime = require('postman-runtime');
// eslint-disable-next-line @typescript-eslint/no-var-requires
const sdk = require('postman-collection');
const SCRIPT_TIMEOUT_MS = 60_000;
const toScope = (values = []) => new sdk.VariableScope({ values: values.map((v) => ({ key: v.key, value: v.value, type: v.type || 'any' })) });
function fromScope(scope) {
    const out = [];
    scope?.values.each((v) => !v.disabled && out.push({ key: v.key, value: v.value }));
    return out;
}
function buildEntrypoint(entrypoint) {
    if (Array.isArray(entrypoint))
        return { execute: entrypoint, lookupStrategy: 'multipleIdOrName', preserveOrder: true };
    if (entrypoint)
        return { execute: entrypoint, lookupStrategy: 'idOrName' };
    return undefined;
}
function computeStats(executions, iterations, startedAt) {
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
function runCollection(input) {
    const startedAt = Date.now();
    const settings = input.settings || {};
    const iterations = Math.max(input.iterationCount || input.data?.length || 1, 1);
    const emit = input.onEvent || (() => undefined);
    const environment = toScope(input.environment);
    const globals = toScope(input.globals);
    const executions = new Map();
    const consoleEntries = [];
    const executionFor = (cursor, item) => {
        const key = `${cursor.iteration}:${cursor.ref}`;
        let execution = executions.get(key);
        if (!execution) {
            execution = {
                id: (0, crypto_1.randomUUID)(),
                itemId: item?.id,
                name: item?.name,
                iteration: cursor.iteration,
                path: (0, serializers_1.itemPath)(item),
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
    const scriptError = (err, results) => (0, serializers_1.errorText)(err || (results || []).find((r) => r?.error)?.error);
    return new Promise((resolve) => {
        new runtime.Runner().run(new sdk.Collection(input.collection), {
            environment,
            globals,
            entrypoint: buildEntrypoint(input.entrypoint),
            data: input.data?.length ? input.data : undefined,
            iterationCount: iterations,
            delay: { item: input.delay || 0 },
            timeout: { request: settings.timeout || Infinity, script: SCRIPT_TIMEOUT_MS },
            abortOnFailure: !!input.bail,
            fileResolver: fs_1.default,
            network: settings.restrictedAddresses ? { restrictedAddresses: settings.restrictedAddresses } : {},
            requester: {
                strictSSL: settings.strictSSL !== false,
                followRedirects: settings.followRedirects !== false,
                cookieJar: settings.disableCookies ? undefined : input.cookieJar,
                timings: true,
                maxResponseSize: settings.maxResponseSize ? settings.maxResponseSize * 1024 * 1024 : undefined,
            },
        }, (err, run) => {
            if (err) {
                return resolve({
                    executions: [],
                    console: [],
                    environment: fromScope(environment),
                    globals: fromScope(globals),
                    collectionVariables: [],
                    error: (0, serializers_1.errorText)(err),
                    stats: computeStats([], 0, startedAt),
                });
            }
            const itemAt = (cursor) => run.state.items?.[cursor?.position];
            input.registerAbort?.(() => run.abort());
            run.start({
                beforeItem(_err, cursor, item) {
                    const { id, itemId, name, iteration, path } = executionFor(cursor, item);
                    emit('beforeItem', { id, itemId, name, iteration, path });
                },
                prerequest(err, cursor, results, item) {
                    executionFor(cursor, item).prerequestError = scriptError(err, results);
                },
                request(err, cursor, response, request, item, cookies, history) {
                    const execution = executionFor(cursor, item);
                    execution.request = (0, serializers_1.serializeRequest)(request, history);
                    execution.response = (0, serializers_1.serializeResponse)(response, history, cookies);
                    execution.error = (0, serializers_1.errorText)(err);
                },
                test(err, cursor, results, item) {
                    executionFor(cursor, item).testError = scriptError(err, results);
                },
                assertion(cursor, assertions) {
                    const execution = executionFor(cursor, itemAt(cursor));
                    (assertions || []).forEach((a) => execution.tests.push({ name: a.name, passed: !!a.passed && !a.skipped, skipped: !!a.skipped, error: (0, serializers_1.errorText)(a.error) }));
                },
                console(cursor, level, ...messages) {
                    const entry = { level, messages, itemId: itemAt(cursor)?.id, time: Date.now() };
                    consoleEntries.push(entry);
                    emit('console', entry);
                },
                item(err, cursor, item, visualizer, result) {
                    const execution = executionFor(cursor, item);
                    if (visualizer)
                        execution.visualizer = { html: visualizer.processedTemplate, error: (0, serializers_1.errorText)(visualizer.error), data: visualizer.data };
                    if (result?.isSkipped)
                        execution.skipped = true;
                    if (err && !execution.error)
                        execution.error = (0, serializers_1.errorText)(err);
                    emit('item', execution);
                },
                exception(_cursor, err) {
                    consoleEntries.push({ level: 'error', messages: [(0, serializers_1.errorText)(err)], time: Date.now() });
                },
                done(err) {
                    const ran = Array.from(executions.values()).filter((e) => e.request || e.error || e.prerequestError || e.skipped);
                    resolve({
                        executions: ran,
                        console: consoleEntries,
                        environment: fromScope(run.state.environment),
                        globals: fromScope(run.state.globals),
                        collectionVariables: fromScope(run.state.collectionVariables),
                        error: (0, serializers_1.errorText)(err),
                        stats: computeStats(ran, iterations, startedAt),
                    });
                },
            });
        });
    });
}
