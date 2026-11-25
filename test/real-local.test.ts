import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { explainNetworkError } from '../src/modules/testapp/real.service';
import { buildRealRequest } from '../src/shared/testapp/real';
import { generateApp } from '../src/shared/testapp/generate';
import { item, shopCollection } from './fixtures/shop';

describe('real API against a local backend', () => {
  it('keeps http:// for a collection written against http://localhost', () => {
    const c = shopCollection() as any;
    c.item = [item('Health', 'GET', 'http://localhost:3000/api/health', { examples: [{ code: 200, body: { ok: true } }] })];
    const b = generateApp(c, { perRequest: true });
    const built = buildRealRequest(b.model.endpoints[0], {}, { enabled: true, allowedHosts: ['localhost'] } as any, () => undefined);
    assert.equal(built.url, 'http://localhost:3000/api/health');
  });
  it('still uses https for a bare host', () => {
    const c = shopCollection() as any;
    c.item = [item('Ping', 'GET', 'https://api.example.com/ping')];
    const b = generateApp(c, { perRequest: true });
    assert.ok(buildRealRequest(b.model.endpoints[0], {}, { enabled: true, allowedHosts: ['api.example.com'] } as any, () => undefined).url.startsWith('https://api.example.com'));
  });
  it('explains network failures in plain words', () => {
    assert.match(explainNetworkError('NETERR: connect ECONNREFUSED 127.0.0.1:3000', 'http://localhost:3000/x'), /Nothing is listening at localhost:3000/);
    assert.match(explainNetworkError('NETERR: getaddrinfo ENOTFOUND api.nope.test', 'https://api.nope.test/x'), /could not find the host api\.nope\.test/);
    assert.match(explainNetworkError('ETIMEDOUT', 'https://slow.test/x'), /did not answer/);
  });
});
