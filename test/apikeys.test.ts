import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { blockedReason, createKeySchema } from '../src/modules/account/apikeys.service';
import { seal, unseal } from '../src/core/security/secret-box';

const day = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), new Date().getUTCDate()));
const row = (o: object = {}) => ({ active: true, dailyLimit: null, totalLimit: null, usedDay: day, usedToday: 0, totalUsed: 0, ...o });

describe('stored API keys', () => {
  it('encrypts and decrypts, and never stores the plain key', () => {
    const k = 'sk-ant-abcdefghijklmnopqrstuvwxyz';
    const sealed = seal(k, 'secret-one');
    assert.ok(!sealed.includes('abcdefghij'));
    assert.equal(unseal(sealed, 'secret-one'), k);
    assert.notEqual(seal(k, 'secret-one'), sealed, 'random iv');
  });
  it('rejects tampering and the wrong server secret', () => {
    const sealed = seal('sk-ant-abcdefghijklmnopqrstuvwxyz', 'a');
    assert.throws(() => unseal(sealed, 'b'));
    assert.throws(() => unseal(sealed.slice(0, -2) + 'AA', 'a'));
    assert.throws(() => unseal('garbage', 'a'));
  });
  it('validates the key shape and limits', () => {
    assert.ok(createKeySchema.safeParse({ label: 'Work', key: 'sk-ant-api03-abcdefghijklmnopqrstuvwxyz' }).success);
    assert.ok(!createKeySchema.safeParse({ label: 'x', key: 'sk-openai-abcdefghijklmnopqrstuvwxyz' }).success);
    assert.ok(!createKeySchema.safeParse({ label: 'x', key: 'sk-ant-abcdefghijklmnopqrstuvwxyz', dailyLimit: 5 }).success);
  });
  it('knows why a key is skipped', () => {
    assert.equal(blockedReason(row()), null);
    assert.equal(blockedReason(row({ active: false })), 'off');
    assert.equal(blockedReason(row({ dailyLimit: 1000, usedToday: 1000 })), 'daily-limit');
    assert.equal(blockedReason(row({ totalLimit: 5000, totalUsed: 5000 })), 'total-limit');
    assert.equal(blockedReason(row({ dailyLimit: 1000, usedToday: 9999, usedDay: new Date(0) })), null, 'a new day starts from zero');
  });
});

import { geminiProvider, openaiProvider } from '../src/shared/testapp/ai';

describe('other providers', () => {
  it('accepts each provider key shape and the vault', () => {
    assert.ok(createKeySchema.safeParse({ provider: 'openai', label: 'o', key: 'sk-proj-abcdefghijklmnopqrstuvwxyz' }).success);
    assert.ok(createKeySchema.safeParse({ provider: 'gemini', label: 'g', key: 'AIzaSyabcdefghijklmnopqrstuvwxyz1234' }).success);
    assert.ok(createKeySchema.safeParse({ provider: 'other', label: 'stripe', key: 'rk_live_abc123' }).success);
    assert.ok(!createKeySchema.safeParse({ provider: 'openai', label: 'o', key: 'AIzaSyabcdefghijklmnopqrstuvwxyz1234' }).success);
    assert.ok(!createKeySchema.safeParse({ provider: 'compatible', label: 'c', key: 'abcdefgh12345' }).success, 'needs endpoint and model');
    assert.ok(createKeySchema.safeParse({ provider: 'compatible', label: 'c', key: 'abcdefgh12345', baseUrl: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b' }).success);
    assert.ok(!createKeySchema.safeParse({ provider: 'other', label: 'x', key: 'abcd1234', dailyLimit: 5000 }).success, 'no limits on vault tokens');
  });
  it('openai adapter sends bearer auth, forces the tool and reads usage', async () => {
    let seen: any;
    const f = (async (url: string, init: any) => {
      seen = { url, init, body: JSON.parse(init.body) };
      return new Response(JSON.stringify({ choices: [{ message: { content: null, tool_calls: [{ function: { arguments: '{"a":1}' } }] } }], usage: { prompt_tokens: 7, completion_tokens: 3 } }));
    }) as any;
    const out = await openaiProvider({ apiKey: 'K', model: 'm' }, f)({ system: 's', user: 'u', maxTokens: 10, tool: { name: 't', description: 'd', schema: { type: 'object' } } });
    assert.equal(seen.url, 'https://api.openai.com/v1/chat/completions');
    assert.equal(seen.init.headers.authorization, 'Bearer K');
    assert.equal(seen.body.tool_choice.function.name, 't');
    assert.deepEqual(out.toolInput, { a: 1 });
    assert.equal(out.inputTokens + out.outputTokens, 10);
  });
  it('gemini adapter keeps the key in a header and parses JSON mode', async () => {
    let seen: any;
    const f = (async (url: string, init: any) => {
      seen = { url, init };
      return new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: '{"ok":true}' }] } }], usageMetadata: { promptTokenCount: 4, candidatesTokenCount: 2 } }));
    }) as any;
    const out = await geminiProvider({ apiKey: 'SECRETKEY', model: 'gemini-x' }, f)({ system: 's', user: 'u', maxTokens: 10, tool: { name: 't', description: 'd', schema: {} } });
    assert.ok(!seen.url.includes('SECRETKEY'));
    assert.equal(seen.init.headers['x-goog-api-key'], 'SECRETKEY');
    assert.deepEqual(out.toolInput, { ok: true });
  });
});
