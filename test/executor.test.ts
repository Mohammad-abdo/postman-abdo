import assert from 'node:assert/strict';
import http from 'node:http';
import { after, before, describe, it } from 'node:test';
import { runCollection } from '../src/modules/execution/runtime/runtime.adapter';
import { PRIVATE_NETWORKS } from '../src/core/security/security.middleware';

/** Real network checks of the SSRF protection that Real API mode relies on (always passes restrictedAddresses). */
describe('real executor network guard', () => {
  let server: http.Server;
  let port = 0;
  let hits = 0;
  before(async () => {
    server = http.createServer((_req, res) => {
      hits++;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    port = (server.address() as { port: number }).port;
  });
  after(() => server.close());

  const collection = () => ({ info: { name: 't', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, item: [{ id: 'one', name: 'one', request: { method: 'GET', url: { raw: `http://127.0.0.1:${port}/x` } } }] });

  it('refuses loopback addresses when restrictedAddresses is set and never reaches the server', async () => {
    hits = 0;
    const r = await runCollection({ collection: collection(), entrypoint: 'one', settings: { restrictedAddresses: PRIVATE_NETWORKS, timeout: 5000 } });
    assert.equal(r.executions[0]?.response ?? null, null);
    assert.ok(r.executions[0]?.error, 'an error is reported');
    assert.equal(hits, 0);
  });
  it('same request works without the restriction (so the block above is the guard, not a broken setup)', async () => {
    hits = 0;
    const r = await runCollection({ collection: collection(), entrypoint: 'one', settings: { timeout: 5000 } });
    assert.equal(r.executions[0].response?.code, 200);
    assert.equal(hits, 1);
  });
  it('does not follow redirects when followRedirects is false', async () => {
    const redirector = http.createServer((_q, res) => {
      res.statusCode = 302;
      res.setHeader('Location', `http://127.0.0.1:${port}/x`);
      res.end();
    });
    await new Promise<void>((r) => redirector.listen(0, '127.0.0.1', r));
    const p = (redirector.address() as { port: number }).port;
    hits = 0;
    const c = collection();
    c.item[0].request.url.raw = `http://127.0.0.1:${p}/r`;
    const r = await runCollection({ collection: c, entrypoint: 'one', settings: { followRedirects: false, timeout: 5000 } });
    redirector.close();
    assert.equal(r.executions[0].response?.code, 302);
    assert.equal(hits, 0);
  });
});
