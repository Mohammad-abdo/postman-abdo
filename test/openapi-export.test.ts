import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { buildOpenApi, schemaOf, splitUrl } from '../src/modules/transfer/openapi.exporter';

describe('OpenAPI export', () => {
  it('splits urls into server and templated path', () => {
    assert.deepEqual(splitUrl('{{baseUrl}}/users/:id/posts?x=1'), { server: '', path: '/users/{id}/posts' });
    assert.deepEqual(splitUrl('https://api.test.dev/v1/items'), { server: 'https://api.test.dev', path: '/v1/items' });
    assert.equal(splitUrl('{{base}}/a/{{id}}').path, '/a/{id}');
  });
  it('guesses schemas from example values', () => {
    assert.deepEqual(schemaOf({ a: 1, b: [true], c: 'x', d: 1.5 }), { type: 'object', properties: { a: { type: 'integer' }, b: { type: 'array', items: { type: 'boolean' } }, c: { type: 'string' }, d: { type: 'number' } } });
  });
  it('builds operations from requests and examples without inventing anything', () => {
    const doc = buildOpenApi({ name: 'Shop' }, [
      { name: 'Get user', method: 'GET', url: 'https://api.shop.dev/users/:id', params: [{ key: 'expand', value: 'orders', enabled: true }, { key: 'off', enabled: false }], headers: [{ key: 'Authorization', value: 'x' }, { key: 'X-Trace', value: '1' }], folderId: 'f1', examples: [{ name: 'ok', code: 200, status: 'OK', body: '{"id":1,"name":"A"}' }, { name: 'missing', code: 404, status: 'Not Found', body: 'nope' }] },
      { name: 'Create user', method: 'POST', url: 'https://api.shop.dev/users', body: { mode: 'raw', raw: '{"name":"A"}' }, examples: [] },
    ] as never, [{ id: 'f1', name: 'Users' }]) as any;
    const get = doc.paths['/users/{id}'].get;
    assert.equal(doc.servers[0].url, 'https://api.shop.dev');
    assert.deepEqual(get.parameters.map((p: any) => `${p.in}:${p.name}`), ['query:expand', 'path:id', 'header:X-Trace']);
    assert.deepEqual(get.tags, ['Users']);
    assert.equal(get.responses['200'].content['application/json'].schema.properties.id.type, 'integer');
    assert.ok(get.responses['404'].content['text/plain']);
    const post = doc.paths['/users'].post;
    assert.equal(post.requestBody.content['application/json'].example.name, 'A');
    assert.ok(post.responses.default, 'no examples is stated, not guessed');
  });
});
