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
