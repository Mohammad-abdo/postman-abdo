/** Fictional "Shop API" collection in Postman v2.1 shape, used by the generator tests. */
type Ex = { code: number; name?: string; body?: unknown };

export const item = (name: string, method: string, url: string, o: { body?: unknown; examples?: Ex[]; auth?: string; script?: string; variables?: Record<string, string> } = {}) => ({
  name,
  id: `id-${method}-${url}`,
  request: {
    method,
    header: [],
    url: { raw: url },
    ...(o.body !== undefined ? { body: { mode: 'raw', raw: JSON.stringify(o.body) } } : {}),
    ...(o.auth ? { auth: { type: o.auth } } : {}),
  },
  response: (o.examples || []).map((e, i) => ({ name: e.name || `Example ${i + 1}`, code: e.code, header: [{ key: 'Content-Type', value: 'application/json' }], body: e.body === undefined ? '' : JSON.stringify(e.body) })),
  ...(o.script ? { event: [{ listen: 'test', script: { exec: o.script.split('\n') } }] } : {}),
});

const user = (id: number) => ({ id, name: `Test User ${id}`, email: `user${id}@example.com`, status: 'active', createdAt: '2024-05-01T10:00:00Z' });
const orderRow = (id: number) => ({ id, total: 19.5, status: 'new', createdAt: '2024-05-02T10:00:00Z' });

export const shopCollection = () => ({
  info: { name: 'Shop API', schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' },
  auth: { type: 'bearer' },
  item: [
    {
      name: 'Auth',
      item: [
        item('Login', 'POST', '{{baseUrl}}/login', {
          auth: 'noauth',
          body: { email: 'a@b.com', password: 'secret' },
          examples: [{ code: 200, body: { token: 'abc.def.ghi', user: user(1) } }, { code: 401, body: { message: 'Invalid credentials' } }],
          script: 'pm.environment.set("token", pm.response.json().token);',
        }),
        item('Profile', 'GET', '{{baseUrl}}/profile', { examples: [{ code: 200, body: user(1) }] }),
        item('Logout', 'POST', '{{baseUrl}}/logout', { examples: [{ code: 204 }] }),
      ],
    },
    {
      name: 'Users',
      item: [
        item('List users', 'GET', '{{baseUrl}}/users?page=1&limit=10&q=', { examples: [{ code: 200, body: { data: [user(1), user(2)], meta: { page: 1, limit: 10, total: 2 } } }] }),
        item('Get user', 'GET', '{{baseUrl}}/users/:id', { examples: [{ code: 200, body: { data: user(1) } }, { code: 404, body: { message: 'User not found' } }] }),
        item('Create user', 'POST', '{{baseUrl}}/users', { body: { name: 'New', email: 'n@x.com', status: 'active' }, examples: [{ code: 201, body: { data: user(3) } }, { code: 422, body: { errors: { email: ['invalid'] } } }] }),
        item('Update user', 'PUT', '{{baseUrl}}/users/:id', { body: { name: 'Changed', email: 'c@x.com' } }),
        item('Delete user', 'DELETE', '{{baseUrl}}/users/:id', { examples: [{ code: 204 }] }),
      ],
    },
    {
      name: 'Orders',
      item: [
        item('List orders', 'GET', '{{baseUrl}}/orders', { examples: [{ code: 200, body: [orderRow(1), orderRow(2)] }] }),
        item('Get order', 'GET', '{{baseUrl}}/orders/:id', { examples: [{ code: 200, body: orderRow(1) }] }),
        item('List items', 'GET', '{{baseUrl}}/orders/:id/items', { examples: [{ code: 200, body: [{ id: 1, sku: 'A-1', qty: 2 }] }] }),
        item('Add item', 'POST', '{{baseUrl}}/orders/:id/items', { body: { sku: 'B-2', qty: 1 }, examples: [{ code: 201, body: { id: 2, sku: 'B-2', qty: 1 } }] }),
        item('Cancel order', 'POST', '{{baseUrl}}/orders/:id/cancel', { examples: [{ code: 202, body: { status: 'cancelling' } }] }),
      ],
    },
    {
      name: 'Misc',
      item: [
        item('Rates', 'GET', 'https://api.thirdparty.com/rates', { examples: [{ code: 200, body: { usd: 1 } }] }),
        item('Health', 'GET', '{{baseUrl}}/health', { examples: [{ code: 200, body: { ok: true } }] }),
        item('Weird thing', 'POST', '{{baseUrl}}/a/b/c/d/e', { examples: [] }),
      ],
    },
  ],
});
