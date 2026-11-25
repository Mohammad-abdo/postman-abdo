import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { abSignificance } from '../src/shared/testapp/ab-stats';

describe('A/B significance', () => {
  it('asks for more data below the minimum', () => {
    const r = abSignificance({ views: 10, taps: 5 }, { views: 100, taps: 10 });
    assert.equal(r.state, 'not-enough-data');
    assert.equal(r.needed, 20);
  });
  it('detects a real winner', () => assert.equal(abSignificance({ views: 500, taps: 150 }, { views: 500, taps: 80 }).state, 'A-wins'));
  it('detects B winning', () => assert.equal(abSignificance({ views: 500, taps: 60 }, { views: 500, taps: 130 }).state, 'B-wins'));
  it('calls close results no difference', () => assert.equal(abSignificance({ views: 200, taps: 40 }, { views: 200, taps: 42 }).state, 'no-difference'));
  it('handles zero taps on both arms', () => assert.equal(abSignificance({ views: 100, taps: 0 }, { views: 100, taps: 0 }).state, 'no-difference'));
});
