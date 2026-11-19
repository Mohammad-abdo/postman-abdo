import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { evaluateCustomRules, validateRule } from '../src/shared/testapp/custom-rules';
import { analyzeCollection } from '../src/shared/testapp/analyzer';
import { generateApp } from '../src/shared/testapp/generate';
import { compareRuns, runMockTests } from '../src/shared/testapp/testing';
import { shopCollection } from './fixtures/shop';

describe('workflow, negative and custom tests', () => {
  const b = generateApp(shopCollection());
  const run = runMockTests(b);
  it('runs the login workflow end to end', () => {
    const wf = run.results.find((r) => r.type === 'workflow')!;
    assert.equal(wf.status, 'passed', JSON.stringify(wf));
  });
  it('replays every documented error example (verified) and unknown-id 404s', () => {
    const doc = run.results.filter((r) => r.type === 'negative' && /replays documented/.test(r.name));
    assert.ok(doc.length >= 3);
    doc.forEach((r) => assert.equal(r.status, 'passed', r.name));
    assert.ok(run.results.some((r) => r.type === 'negative' && /unknown id/.test(r.name) && r.status === 'passed'));
    assert.ok(run.results.some((r) => r.type === 'negative' && /empty result/.test(r.name) && r.status === 'passed'));
  });
  it('has no failures overall', () => {
    assert.equal(run.stats.failed, 0, JSON.stringify(run.results.filter((r) => r.status === 'failed'), null, 1));
  });
  it('executes user-defined tests and fails them when expectations break', () => {
    const ok = runMockTests(b, { customTests: [{ name: 'users list ok', endpoint: 'GET /users', expectStatus: 200, expectBodyKeys: ['data', 'meta.total'] }] });
    assert.equal(ok.results.find((r) => r.type === 'custom')!.status, 'passed');
    const bad = runMockTests(b, { customTests: [{ name: 'wrong', endpoint: 'GET /users', expectStatus: 500 }, { name: 'ghost', endpoint: 'GET /ghost', expectStatus: 200 }] });
    assert.deepEqual(bad.results.filter((r) => r.type === 'custom').map((r) => r.status), ['failed', 'failed']);
  });
  it('detects regressions between two runs', () => {
    const broken = generateApp(shopCollection());
    broken.schema.actions['act.users.list'].endpoint = 'GET /ghost';
    const next = runMockTests(broken);
    const report = compareRuns(run.results, next.results);
    assert.ok(report.newFailures.some((n) => /act\.users\.list|Action act\.users\.list/.test(n)), JSON.stringify(report));
    assert.deepEqual(compareRuns(run.results, run.results).newFailures, []);
    const fixed = compareRuns(next.results, run.results);
    assert.ok(fixed.fixed.length > 0);
  });
});

describe('custom rules', () => {
  const rule = (over: object = {}) => ({ id: 'C-1', name: 'test', priority: 100, when: { fact: 'path', op: 'startsWith', value: '/orders' }, then: [{ do: 'exclude', reason: 'orders out of scope' }], ...over });

  it('validates structure and rejects unsafe or unknown input', () => {
    assert.deepEqual(validateRule(rule()), []);
    assert.ok(validateRule(rule({ when: { fact: 'nope', op: 'eq', value: 1 } })).length);
    assert.ok(validateRule(rule({ when: { fact: 'path', op: 'eval', value: 'x' } })).length);
    assert.ok(validateRule(rule({ then: [{ do: 'runScript', code: 'process.exit()' }] })).length);
    assert.ok(validateRule(rule({ when: { fact: 'path', op: 'regex', value: '(a+)+$' } })).some((e) => /backtrack/.test(e)));
    assert.ok(validateRule(rule({ when: { fact: 'path', op: 'regex', value: '(' } })).some((e) => /invalid/.test(e)));
    assert.ok(validateRule(rule({ id: '../x' })).length);
    assert.ok(validateRule(rule({ then: [{ do: 'setRole', role: 'list' }] })).some((e) => /needs a resource/.test(e)));
    let deep: any = { fact: 'method', op: 'eq', value: 'GET' };
    for (let i = 0; i < 10; i++) deep = { not: deep };
    assert.ok(validateRule(rule({ when: deep })).some((e) => /deeper/.test(e)));
  });
  it('excludes matching endpoints and outranks built-in rules, with provenance', () => {
    const o = generateApp(shopCollection(), { customRules: [rule()] });
    const orders = Object.keys(o.schema.dispositions).filter((k) => k.includes('/orders'));
    assert.ok(orders.length >= 5);
    orders.forEach((k) => {
      assert.equal(o.schema.dispositions[k].state, 'excluded');
      assert.equal(o.schema.dispositions[k].ruleId, 'C-1');
      assert.equal(o.schema.dispositions[k].provenance, 'user');
    });
    assert.ok(!o.schema.screens.some((s) => s.id.startsWith('scr.orders')));
    assert.ok(o.schema.screens.some((s) => s.id === 'scr.users.list'));
    assert.equal(o.customRules.matches[0].endpoints.length, orders.length);
  });
  it('supports boolean logic, background and explorer actions', () => {
    const o = generateApp(shopCollection(), {
      customRules: [
        rule({ id: 'C-2', when: { all: [{ fact: 'method', op: 'eq', value: 'DELETE' }, { not: { fact: 'folder', op: 'eq', value: 'Orders' } }] }, then: [{ do: 'background' }] }),
        rule({ id: 'C-3', when: { fact: 'name', op: 'regex', value: '^Cancel' }, then: [{ do: 'explorer' }] }),
      ],
    });
    assert.equal(o.schema.dispositions['DELETE /users/{id}'].state, 'background');
    assert.equal(o.schema.dispositions['POST /orders/{id}/cancel'].state, 'explorer');
    assert.ok(!o.schema.actions['act.orders.cancel'], 'forced-explorer endpoint keeps no dedicated action');
    assert.ok(o.schema.screens.find((s) => s.id === 'scr.explorer')!.components.some((c) => o.schema.actions[c.action]?.endpoint === 'POST /orders/{id}/cancel'));
  });
  it('setRole re-classifies an endpoint (e.g. a POST search)', () => {
    const c: any = shopCollection();
    c.item[3].item.push({ name: 'Find users', request: { method: 'POST', url: { raw: '{{baseUrl}}/users/lookup' } }, response: [] });
    const without = generateApp(c);
    assert.equal(without.graph.roles['POST /users/lookup'].role, 'unknown');
    const withRule = generateApp(c, { customRules: [rule({ id: 'C-4', when: { fact: 'path', op: 'eq', value: '/users/lookup' }, then: [{ do: 'setRole', role: 'search', resource: 'users' }] })] });
    assert.equal(withRule.graph.roles['POST /users/lookup'].role, 'search');
    assert.equal(withRule.schema.dispositions['POST /users/lookup'].state, 'mapped');
  });
  it('skips invalid rules and reports them instead of executing anything', () => {
    const o = generateApp(shopCollection(), { customRules: [{ id: 'BAD', name: 'x', when: { fact: 'zzz', op: 'eq' }, then: [{ do: 'exclude' }] }] });
    assert.equal(o.customRules.invalid.length, 1);
    assert.equal(o.schema.dispositions['GET /users'].state, 'mapped');
  });
  it('is deterministic and disabled rules do nothing', () => {
    const a = JSON.stringify(generateApp(shopCollection(), { customRules: [rule()] }).schema);
    assert.equal(a, JSON.stringify(generateApp(shopCollection(), { customRules: [rule()] }).schema));
    assert.equal(generateApp(shopCollection(), { customRules: [rule({ enabled: false })] }).schema.dispositions['GET /orders'].state, 'mapped');
  });
  it('is safe on hostile facts (huge strings)', () => {
    const m = analyzeCollection(shopCollection());
    m.endpoints[0].name = 'a'.repeat(200000);
    const r = evaluateCustomRules(m, [rule({ when: { fact: 'name', op: 'regex', value: '^(a|b)*c$' } }) as any]);
    assert.ok(Array.isArray(r.matches));
  });
});
