import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isFreeRepeat } from '../src/modules/platform/limits.service';

describe('free repeats of the same read', () => {
  it('counts the first read, frees a few repeats, then counts again', () => {
    const t = 1_000_000;
    assert.equal(isFreeRepeat('u1', 'GET', 'https://x/a', t), false);
    for (let i = 0; i < 5; i++) assert.equal(isFreeRepeat('u1', 'GET', 'https://x/a', t + 100), true);
    assert.equal(isFreeRepeat('u1', 'GET', 'https://x/a', t + 200), false);
    assert.equal(isFreeRepeat('u1', 'GET', 'https://x/a', t + 11_000), false);
  });
  it('never frees writes and keeps users and urls apart', () => {
    assert.equal(isFreeRepeat('u2', 'POST', 'https://x/a', 5), false);
    assert.equal(isFreeRepeat('u2', 'POST', 'https://x/a', 6), false);
    isFreeRepeat('u3', 'GET', 'https://x/b', 5);
    assert.equal(isFreeRepeat('u4', 'GET', 'https://x/b', 6), false);
    assert.equal(isFreeRepeat('u3', 'GET', 'https://x/c', 6), false);
  });
});
