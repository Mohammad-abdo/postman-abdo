import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { analyzeCollection } from '../src/shared/testapp/analyzer';
import { buildContract } from '../src/shared/testapp/contract';
import { buildRealRequest, compareResponses, diffBodies, gateRequest, hostAllowed, redactHeaders } from '../src/shared/testapp/real';
import { shopCollection } from './fixtures/shop';

const model = analyzeCollection(shopCollection());
const ep = (k: string) => model.endpoints.find((e) => e.key === k)!;
const on = { enabled: true, allowedHosts: ['api.shop.test', '.staging.shop.test'] };

describe('real-mode guards', () => {
  it('matches exact hosts and suffixes only', () => {
    assert.ok(hostAllowed('api.shop.test', ['api.shop.test']));
    assert.ok(hostAllowed('API.SHOP.TEST', ['api.shop.test']));
    assert.ok(hostAllowed('a.staging.shop.test', ['.staging.shop.test']));
    assert.ok(!hostAllowed('staging.shop.test', ['.staging.shop.test']));
    assert.ok(!hostAllowed('evil-api.shop.test', ['api.shop.test']));
    assert.ok(!hostAllowed('api.shop.test.evil.com', ['api.shop.test']));
    assert.ok(!hostAllowed('x.com', []));
  });
  it('is closed by default', () => {
    assert.equal(gateRequest({ method: 'GET', url: 'https://api.shop.test/x', settings: {} }).ok, false);
    assert.equal(gateRequest({ method: 'GET', url: 'https://api.shop.test/x', settings: { enabled: true } }).ok, false);
    assert.equal(gateRequest({ method: 'GET', url: 'https://api.shop.test/x', settings: on }).ok, true);
  });
  it('blocks hosts outside the allowlist, odd schemes and embedded credentials', () => {
    for (const url of ['https://evil.test/x', 'http://169.254.169.254/latest', 'http://localhost:4000/', 'file:///etc/passwd', 'https://user:pw@api.shop.test/', 'not a url', 'https://api.shop.test.evil.com/']) {
      assert.equal(gateRequest({ method: 'GET', url, settings: on }).ok, false, url);
    }
  });
  it('requires opt-in AND per-run confirmation for state-changing methods', () => {
    const base = { url: 'https://api.shop.test/users', settings: on };
    assert.equal(gateRequest({ ...base, method: 'POST' }).ok, false);
    assert.equal(gateRequest({ ...base, method: 'POST', settings: { ...on, allowUnsafe: true } }).ok, false);
    assert.equal(gateRequest({ ...base, method: 'POST', settings: { ...on, allowUnsafe: true }, confirmUnsafe: true }).ok, true);
    assert.equal(gateRequest({ ...base, method: 'DELETE', settings: { ...on, allowUnsafe: true }, confirmUnsafe: true }).ok, true);
  });
  it('production environments need an admin plus a second confirmation', () => {
    const args = { method: 'POST', url: 'https://api.shop.test/users', settings: { ...on, allowUnsafe: true }, confirmUnsafe: true, environmentStage: 'production' };
    assert.equal(gateRequest(args).ok, false);
    assert.equal(gateRequest({ ...args, isWorkspaceAdmin: true }).ok, false);
    assert.equal(gateRequest({ ...args, isWorkspaceAdmin: true, confirmProduction: true }).ok, true);
    assert.equal(gateRequest({ ...args, confirmProduction: true }).ok, false);
    assert.equal(gateRequest({ method: 'GET', url: 'https://api.shop.test/x', settings: on, environmentStage: 'production' }).ok, true);
  });
});

describe('real request building', () => {
  const resolve = (n: string) => (n === 'baseUrl' ? 'https://api.shop.test' : undefined);
  it('fills path params, resolves the host variable and appends query', () => {
    const r = buildRealRequest(ep('GET /users/{id}'), { pathParams: { id: 'a b/1' } }, on, resolve);
    assert.equal(r.url, 'https://api.shop.test/users/a%20b%2F1');
    assert.deepEqual(r.missing, []);
    const l = buildRealRequest(ep('GET /users'), { query: { q: 'x y' } }, on, resolve);
    assert.match(l.url, /^https:\/\/api\.shop\.test\/users\?/);
    assert.match(l.url, /q=x\+y/);
  });
  it('reports missing path values and unresolved variables instead of guessing', () => {
    assert.deepEqual(buildRealRequest(ep('GET /users/{id}'), {}, on, resolve).missing, ['id']);
    assert.ok(buildRealRequest(ep('GET /users'), {}, on, () => undefined).missing.includes('base URL variable'));
  });
  it('baseUrl override wins over the collection host', () => {
    const r = buildRealRequest(ep('GET /users'), {}, { ...on, baseUrl: 'https://x.staging.shop.test/' }, resolve);
    assert.ok(r.url.startsWith('https://x.staging.shop.test/users'));
  });
});

describe('mock vs real comparison', () => {
  const contract = buildContract(model);
  const mock = { status: 200, body: { data: [{ id: 1, name: 'A', createdAt: '2024-01-01T00:00:00Z' }], meta: { total: 1 } } };
  it('ignores volatile values but still compares structure', () => {
    const real = { status: 200, body: { data: [{ id: 99, name: 'A', createdAt: '2025-05-05T00:00:00Z' }], meta: { total: 40 } } };
    const out = compareResponses({ mock, real, documentedCodes: [200] });
    assert.equal(out.status, 'passed', JSON.stringify(out));
    assert.ok(out.diffs.every((d) => d.kind === 'value-differs'));
  });
  it('reports missing/extra fields and type changes as warnings, not failures (inferred schema)', () => {
    const real = { status: 200, body: { data: [{ id: 1, name: 5, extra: true }], meta: { total: 1 } } };
    const d = diffBodies(mock.body, real.body);
    assert.ok(d.some((x) => x.kind === 'type-mismatch' && x.path.endsWith('.name')));
    assert.ok(d.some((x) => x.kind === 'missing-in-real' && x.path.endsWith('.createdAt')));
    assert.ok(d.some((x) => x.kind === 'extra-in-real' && x.path.endsWith('.extra')));
    const out = compareResponses({ mock, real, documentedCodes: [200] });
    assert.equal(out.status, 'warning');
    assert.equal(out.certainty, 'inferred');
  });
  it('fails only on an undocumented status code (documented fact)', () => {
    const out = compareResponses({ mock, real: { status: 500, body: { error: 'x' } }, documentedCodes: [200, 404] });
    assert.equal(out.status, 'failed');
    assert.equal(out.certainty, 'verified');
    assert.equal(compareResponses({ mock, real: { status: 404, body: mock.body }, documentedCodes: [200, 404] }).status, 'passed');
  });
  it('flags an empty real list when the mock had data', () => {
    assert.ok(diffBodies([{ a: 1 }], []).some((d) => d.kind === 'empty-in-real'));
  });
  it('uses the contract for extra schema notes', () => {
    const c = contract.endpoints['GET /users'];
    const out = compareResponses({ mock, real: { status: 200, body: { data: 'nope', meta: { total: 1 } } }, documentedCodes: [200], contract: c });
    assert.equal(out.status, 'warning');
  });
  it('strips sensitive response headers', () => {
    assert.deepEqual(redactHeaders({ 'Set-Cookie': 'a=1', Authorization: 'x', 'Content-Type': 'json' }), { 'Content-Type': 'json' });
  });
});
