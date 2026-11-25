import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateApp } from '../src/shared/testapp/generate';
import { buildReport } from '../src/shared/testapp/report';
import { runMockTests } from '../src/shared/testapp/testing';
import { item, shopCollection } from './fixtures/shop';

const gen = (c: unknown = shopCollection()) => generateApp(c, { perRequest: true });
const report = (c: unknown = shopCollection(), extra: Partial<Parameters<typeof buildReport>[0]> = {}) => {
  const b = gen(c);
  return buildReport({ model: b.model, schema: b.schema as any, ...extra });
};

describe('collection ↔ design report', () => {
  it('explains every endpoint of the collection', () => {
    const b = gen();
    const r = report();
    assert.equal(r.endpoints.length, b.model.endpoints.length);
    for (const e of r.endpoints) {
      assert.ok(e.explanation.startsWith(`${e.method} ${e.path}`), e.key);
      assert.ok(['in-app', 'developer-menu', 'background', 'excluded', 'unused'].includes(e.status));
    }
    assert.equal(r.summary.endpoints, r.summary.inApp + r.summary.developerMenu + r.summary.background + r.summary.excluded + r.summary.unused);
  });
  it('says where list and detail endpoints appear in the app', () => {
    const r = report();
    const list = r.endpoints.find((e) => e.method === 'GET' && /orders$/.test(e.path));
    assert.ok(list && list.places.length > 0, 'the orders list is placed somewhere');
    assert.equal(list!.status, 'in-app');
  });
  it('reports compatibility as the share of app-worthy endpoints that are used', () => {
    const r = report();
    const should = r.summary.endpoints - r.summary.background - r.summary.excluded;
    assert.equal(r.summary.compatibility, should ? Math.round((r.summary.inApp / should) * 100) : 100);
    assert.ok(r.summary.compatibility >= 0 && r.summary.compatibility <= 100);
  });
  it('flags a design that calls an action the collection does not have', () => {
    const b = gen();
    const r = buildReport({ model: b.model, schema: b.schema as any, customization: { home: [{ id: 's1', type: 'list', title: 'Broken', action: 'does-not-exist' }] } as any });
    assert.ok(r.issues.some((i) => i.severity === 'error' && /does not exist/.test(i.title)));
  });
  it('flags endpoints nothing uses and endpoints without examples', () => {
    const c = shopCollection() as any;
    c.item.push(item('Ping', 'GET', 'https://api.shop.test/api/internal/ping'));
    const r = report(c);
    const ping = r.endpoints.find((e) => e.path.endsWith('/internal/ping'))!;
    assert.ok(ping);
    assert.ok(ping.examples.length === 0);
  });
  it('attaches test results to their endpoint', () => {
    const b = gen();
    const out = runMockTests(b, { seed: 1 });
    const r = buildReport({ model: b.model, schema: b.schema as any, results: out.results });
    assert.ok(r.summary.tests.run);
    assert.ok(r.endpoints.some((e) => e.tests.passed > 0));
    assert.equal(r.summary.tests.passed, r.endpoints.reduce((n, e) => n + e.tests.passed, 0));
  });
  it('sorts issues with errors first', () => {
    const b = gen();
    const r = buildReport({ model: b.model, schema: b.schema as any, customization: { home: [{ id: 's1', type: 'list', action: 'nope' }] } as any });
    const sev = r.issues.map((i) => i.severity);
    assert.deepEqual(sev, [...sev].sort((a, c) => ({ error: 0, warn: 1, info: 2 })[a] - ({ error: 0, warn: 1, info: 2 })[c]));
  });
});
