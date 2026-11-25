import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anthropicProvider, contractDigest, explainPrompt, parseSuggestions, redact, suggestPrompt } from '../src/shared/testapp/ai';
import { generateApp } from '../src/shared/testapp/generate';
import { runMockTests } from '../src/shared/testapp/testing';
import { shopCollection } from './fixtures/shop';

const b = generateApp(shopCollection());

describe('AI assistant safety', () => {
  it('redacts credentials, tokens, emails and long numbers before anything is sent', () => {
    const out = JSON.stringify(
      redact({ password: 'hunter2', token: 'abc', auth: { Authorization: 'Bearer abcdefghijklmnop' }, note: 'mail me at jane@corp.com', jwt: 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk', card: '4111111111111111', key: 'sk-abcdefghijklmnopqrstuv', nested: { apiKey: 'zzz', ok: 'fine' } }),
    );
    for (const secret of ['hunter2', 'abcdefghijklmnop', 'jane@corp.com', 'eyJhbGci', '4111111111111111', 'sk-abcdefghijklmnopqrstuv', 'zzz']) assert.ok(!out.includes(secret), `${secret} leaked`);
    assert.ok(out.includes('fine'));
  });
  it('digest has structure only: no example values', () => {
    const d = JSON.stringify(contractDigest(b));
    assert.ok(!d.includes('user1@example.com') && !d.includes('Test User') && !d.includes('abc.def.ghi'));
    assert.ok(d.includes('GET /users'));
  });
  it('prompt tells the model it may not invent behaviour', () => {
    const p = suggestPrompt(b);
    assert.match(p.system, /Never invent/);
    assert.ok(!p.user.includes('abc.def.ghi'));
  });
  it('accepts valid suggestions and rejects unknown endpoints, bad shapes, huge bodies and duplicates', () => {
    const reply = JSON.stringify([
      { name: 'Create user with empty body returns validation error', endpoint: 'POST /users', body: {}, scenario: 'validation', expectStatus: 422, reason: 'negative' },
      { name: 'Ghost endpoint test', endpoint: 'GET /ghost', expectStatus: 200 },
      { name: 'Bad status', endpoint: 'GET /users', expectStatus: 99 },
      { name: 'Huge body', endpoint: 'POST /users', body: { a: 'x'.repeat(6000) }, expectStatus: 201 },
      { name: 'Create user with empty body returns validation error', endpoint: 'POST /users', expectStatus: 422 },
      { name: 'No auth list', endpoint: 'GET /users', noAuth: true, expectStatus: 401 },
      'not an object',
    ]);
    const r = parseSuggestions(`Here you go:\n${reply}\nthanks`, b);
    assert.deepEqual(r.accepted.map((a) => a.endpoint + a.expectStatus), ['POST /users422', 'GET /users401']);
    assert.ok(r.accepted.every((a) => a.origin === 'ai'));
    assert.equal(r.rejected.length, 5);
  });
  it('rejects non-JSON model output without throwing', () => {
    assert.equal(parseSuggestions('I think you should test more', b).accepted.length, 0);
    assert.equal(parseSuggestions('{"a":1}', b).accepted.length, 0);
  });
  it('accepted suggestions run as ordinary custom tests (and can fail)', () => {
    const r = parseSuggestions(JSON.stringify([{ name: 'Users list without token is rejected', endpoint: 'GET /users', noAuth: true, expectStatus: 401 }, { name: 'Wrong expectation', endpoint: 'GET /users', expectStatus: 418 }]), b);
    const run = runMockTests(b, { customTests: r.accepted });
    const custom = run.results.filter((x) => x.type === 'custom');
    assert.deepEqual(custom.map((x) => x.status), ['passed', 'failed']);
    assert.equal((custom[0].evidence as any).origin, 'ai');
  });
  it('explain prompt only carries redacted evidence', () => {
    const p = explainPrompt({ id: 'T1', name: 'x', type: 'contract', mode: 'mock', status: 'failed', expected: 'e', actual: 'a', certainty: 'verified', error: 'token Bearer abcdefghijklmnop for jane@corp.com', evidence: { request: { password: 'p' } } });
    assert.ok(!p.user.includes('abcdefghijklmnop') && !p.user.includes('jane@corp.com') && !p.user.includes('"p"'));
  });
  it('provider adapter sends the key as a header only, reports usage, and surfaces HTTP errors', async () => {
    let seen: any;
    const ok = anthropicProvider({ apiKey: 'KEY', model: 'm' }, (async (url: string, init: any) => {
      seen = { url, init };
      return { ok: true, json: async () => ({ content: [{ type: 'text', text: 'hi' }], usage: { input_tokens: 10, output_tokens: 5 } }) };
    }) as any);
    const out = await ok({ system: 's', user: 'u', maxTokens: 10 });
    assert.deepEqual({ ...out }, { text: 'hi', toolInput: undefined, inputTokens: 10, outputTokens: 5 });
    assert.equal(seen.init.headers['x-api-key'], 'KEY');
    assert.ok(!seen.init.body.includes('KEY'));
    const bad = anthropicProvider({ apiKey: 'K', model: 'm' }, (async () => ({ ok: false, status: 429 })) as any);
    await assert.rejects(() => bad({ system: 's', user: 'u', maxTokens: 1 }), /429/);
  });
});
