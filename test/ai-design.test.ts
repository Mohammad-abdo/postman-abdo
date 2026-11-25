import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { anthropicProvider } from '../src/shared/testapp/ai';
import { designPrompt, diffDesign, mergePatch, parseProposals, parseReview } from '../src/shared/testapp/ai-design';
import { generateApp } from '../src/shared/testapp/generate';
import { shopCollection } from './fixtures/shop';

const b = generateApp(shopCollection());
const base = { v: 1 as const, theme: { primary: '#112233', radius: 8 } };

describe('AI design patches', () => {
  it('merges objects, replaces arrays and removes null keys', () => {
    assert.deepEqual(mergePatch({ a: { x: 1, y: 2 }, l: [1, 2] }, { a: { y: null, z: 3 }, l: [9] }), { a: { x: 1, z: 3 }, l: [9] });
  });
  it('accepts a valid patch and reports a readable diff', () => {
    const { proposals, errors } = parseProposals({ options: [{ name: 'Gold', summary: 'Warmer', patch: { theme: { primary: '#C9A227' } } }] }, base);
    assert.equal(errors.length, 0);
    assert.equal(proposals[0].customization.theme?.primary, '#C9A227');
    assert.equal(proposals[0].customization.theme?.radius, 8);
    assert.deepEqual(proposals[0].changes.map((c) => c.path), ['theme.primary']);
  });
  it('rejects unknown keys, bad colours and empty patches with a reason', () => {
    const r = parseProposals({ options: [{ summary: 'x', patch: { theme: { primary: 'red' } } }, { summary: 'y', patch: { nope: 1 } }, { summary: 'z', patch: { theme: { radius: 8 } } }] }, base);
    assert.equal(r.proposals.length, 0);
    assert.equal(r.errors.length, 3);
    assert.match(r.errors[2], /changes nothing/);
  });
  it('rejects malformed replies', () => {
    assert.equal(parseProposals({ options: [] }, base).proposals.length, 0);
    assert.equal(parseProposals('text', base).proposals.length, 0);
  });
  it('never lets the model switch the schema version or exceed limits', () => {
    const r = parseProposals({ options: [{ summary: 'x', patch: { v: 2, tabs: Array.from({ length: 9 }, (_, i) => ({ id: `t${i}`, label: 'T', icon: 'home', screen: 'home' })) } }] }, base);
    assert.equal(r.proposals.length, 0);
  });
  it('diff lists changed leaves only', () => {
    assert.deepEqual(diffDesign({ a: 1, b: { c: 2 } }, { a: 1, b: { c: 3 } }).map((c) => c.path), ['b.c']);
  });
  it('prompt carries structure only, no example values', () => {
    const p = designPrompt(b, null, 'redesign', 'make it dark');
    assert.match(p.user, /3 clearly different/);
    assert.ok(!p.user.includes('user1@example.com') && !p.user.includes('abc.def.ghi'));
  });
  it('parses a review and rejects junk', () => {
    assert.equal(parseReview({ score: 80, findings: [{ severity: 'tip', title: 't', fix: 'f' }] })?.score, 80);
    assert.equal(parseReview({ score: 'a' }), null);
  });
  it('provider sends a cached system prompt and a forced tool, and reads the tool input', async () => {
    let body: any;
    const f = (async (_u: string, init: any) => {
      body = JSON.parse(init.body);
      return { ok: true, json: async () => ({ content: [{ type: 'tool_use', input: { options: [] } }], usage: { input_tokens: 3, output_tokens: 4 } }) };
    }) as unknown as typeof fetch;
    const out = await anthropicProvider({ apiKey: 'k', model: 'm' }, f)({ system: 's', user: 'u', maxTokens: 10, model: 'fast', tool: { name: 't', description: 'd', schema: { type: 'object' } } });
    assert.equal(body.model, 'fast');
    assert.equal(body.system[0].cache_control.type, 'ephemeral');
    assert.deepEqual(body.tool_choice, { type: 'tool', name: 't' });
    assert.deepEqual(out.toolInput, { options: [] });
    assert.equal(out.inputTokens + out.outputTokens, 7);
  });
});
