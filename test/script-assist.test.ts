import assert from 'node:assert/strict';
import { after, describe, it } from 'node:test';
import { aiService, scriptInputSchema, setAiProvider } from '../src/modules/testapp/ai.service';
import { prisma } from '../src/core/database/prisma';

const user = `script-test-${Date.now()}`;
describe('AI script assist', () => {
  after(async () => {
    setAiProvider(null);
    await prisma.testAppAiUserUsage.deleteMany({ where: { userId: user } });
    await prisma.aiUsageDaily.deleteMany({ where: { userId: user } });
    await prisma.$disconnect();
  });

  it('returns code without fences, redacts secrets before sending, and logs usage', async () => {
    let sent = '';
    setAiProvider(async ({ user: u, tool }) => {
      sent = u;
      assert.equal(tool?.name, 'write_script');
      return { text: '', toolInput: { code: '```js\npm.test("ok", () => pm.response.to.have.status(200));\n```', explanation: 'Checks 200.' }, inputTokens: 10, outputTokens: 5 };
    });
    const out = await aiService.script(user, { phase: 'test', prompt: 'check status', context: { method: 'GET', url: 'https://x/y', body: '{"password":"hunter2","token":"abc"}' } });
    assert.equal(out.code, 'pm.test("ok", () => pm.response.to.have.status(200));');
    assert.equal(out.tokens, 15);
    assert.ok(!sent.includes('hunter2'), 'secrets stay out of the prompt');
    const row = await prisma.aiUsageDaily.findFirst({ where: { userId: user, feature: 'script' } });
    assert.equal(row?.tokens, 15);
  });
  it('rejects an unusable reply and bad input', async () => {
    setAiProvider(async () => ({ text: '', toolInput: { nope: 1 }, inputTokens: 1, outputTokens: 1 }));
    await assert.rejects(() => aiService.script(user, { phase: 'test', prompt: 'something' }), /usable script/);
    assert.ok(!scriptInputSchema.safeParse({ phase: 'x', prompt: 'abc' }).success);
    assert.ok(!scriptInputSchema.safeParse({ phase: 'test', prompt: 'a' }).success);
  });
});

describe('AI response explanation', () => {
  it('sends evidence with secrets removed and returns a structured answer', async () => {
    const { explainResponseSchema } = await import('../src/modules/testapp/ai.service');
    let sent = '';
    setAiProvider(async ({ user: u }) => ((sent = u), { text: '', toolInput: { summary: 'Auth failed.', causes: ['Token expired'], steps: ['Refresh the token'] }, inputTokens: 4, outputTokens: 4 }));
    const input = explainResponseSchema.parse({ method: 'GET', url: 'https://x/y', status: 401, requestHeaders: ['Authorization'], requestBody: '{"password":"hunter2"}', responseBody: '{"error":"bad token eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abcdefghijk"}' });
    const out = await aiService.explainResponse(user, input);
    assert.equal(out.summary, 'Auth failed.');
    assert.ok(!sent.includes('hunter2') && !sent.includes('eyJhbGci'));
    assert.ok(sent.includes('401'));
  });
  it('rejects an unreadable answer', async () => {
    setAiProvider(async () => ({ text: '', toolInput: { x: 1 }, inputTokens: 1, outputTokens: 1 }));
    await assert.rejects(() => aiService.explainResponse(user, { status: 500 }), /could not be read/);
  });
});
