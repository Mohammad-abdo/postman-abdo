import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { customizationSchema, publishRemixSchema } from '../src/shared/testapp/design/customize';
import { generateApp } from '../src/shared/testapp/generate';
import { item } from './fixtures/shop';

const ok = (body: unknown) => ({ examples: [{ code: 200, body }] });
const design = (name: string, items: unknown[]) => generateApp({ info: { name }, item: items }, { perRequest: true }).schema.design!;

describe('design customizations', () => {
  const valid = {
    v: 1,
    theme: { style: 'neon', mode: 'dark', primary: '#A3E635', font: 'Space Grotesk', radius: 12, tabStyle: 'docked', scale: 1.1 },
    brand: { name: 'My Garage', logo: 'https://cdn.example.com/logo.png', icon: 'directions_car' },
    dir: 'rtl',
    tabs: [{ id: 'home', label: 'Home', icon: 'home', screen: 'home' }],
    home: [
      { id: 'sec.1', type: 'banner', title: 'Winter sale', body: '30% off', target: { entity: 'product', values: { type: 'SALE' } } },
      { id: 'sec.2', type: 'grid', entity: 'product', action: 'send.abc', columns: 3, limit: 9 },
    ],
    pages: [{ id: 'about', title: 'About', icon: 'info', sections: [{ id: 'sec.3', type: 'text', body: 'Hello' }] }],
    entities: { product: { label: 'Part', plural: 'Parts', card: 'product', roles: { title: 'name' } } },
    ctas: { 'send.abc': { label: 'Buy now', hidden: false } },
  };

  it('accepts a full studio design', () => {
    assert.equal(customizationSchema.safeParse(valid).success, true);
    assert.equal(publishRemixSchema.safeParse({ name: 'Dark mode', customization: valid }).success, true);
  });

  it('rejects anything that could inject markup or load unsafe content', () => {
    const bad = (patch: object) => customizationSchema.safeParse({ ...valid, ...patch }).success;
    assert.equal(bad({ theme: { primary: 'red; background:url(x)' } }), false);
    assert.equal(bad({ brand: { logo: 'javascript:alert(1)' } }), false);
    assert.equal(bad({ brand: { logo: 'http://insecure.example.com/a.png' } }), false);
    assert.equal(bad({ theme: { font: 'Comic Sans; } body { display:none' } }), false);
    assert.equal(bad({ home: [{ id: 'x', type: 'script' }] }), false);
    assert.equal(bad({ extra: true }), false);
    assert.equal(bad({ home: [{ id: 'x', type: 'text', body: 'y'.repeat(70_000) }] }), false, 'size and length limits');
  });
});

describe('app design: more kinds of business, each with its own look', () => {
  it('recognises gyms, salons, travel, jobs, streaming and business tools', () => {
    const cases: [string, unknown[], string][] = [
      ['FitLife Gym', [item('Workouts', 'GET', '{{u}}/workouts', ok([{ id: 1, title: 'HIIT' }])), item('Classes', 'GET', '{{u}}/bookings', ok([{ id: 1 }]))], 'fitness'],
      ['Glow Salon', [item('Services', 'GET', '{{u}}/services', ok([{ id: 1, name: 'Haircut', price: 100 }])), item('Book', 'POST', '{{u}}/bookings', ok({ id: 1 }))], 'beauty'],
      ['SkyTrips', [item('Flights', 'GET', '{{u}}/flights', ok([{ id: 1 }])), item('Hotels', 'GET', '{{u}}/hotels', ok([{ id: 1 }]))], 'travel'],
      ['HireMe', [item('Jobs', 'GET', '{{u}}/jobs', ok([{ id: 1, title: 'Dev' }])), item('Apply', 'POST', '{{u}}/jobs/:id/apply', ok({}))], 'jobs'],
      ['Tunes', [item('Songs', 'GET', '{{u}}/songs', ok([{ id: 1 }])), item('Playlists', 'GET', '{{u}}/playlists', ok([{ id: 1 }]))], 'media'],
      ['Acme CRM', [item('Leads', 'GET', '{{u}}/leads', ok([{ id: 1 }])), item('Invoices', 'GET', '{{u}}/invoices', ok([{ id: 1 }]))], 'business'],
    ];
    for (const [name, items, domain] of cases) assert.equal(design(name, items).domain.id, domain, name);
  });

  it('gives different collections of the same business different looks, deterministically', () => {
    const shops = ['Alpha Store', 'Beta Shop', 'Gamma Market', 'Delta Mall'].map((n) => design(n, [item('Products', 'GET', '{{u}}/products', ok([{ id: 1, name: 'A', price: 1 }]))]).theme);
    assert.ok(new Set(shops.map((t) => `${t.style}|${t.primary}|${t.font}`)).size >= 2, 'not every shop looks the same');
    const again = design('Alpha Store', [item('Products', 'GET', '{{u}}/products', ok([{ id: 1, name: 'A', price: 1 }]))]).theme;
    assert.deepEqual(again, shops[0]);
  });

  it('writes Arabic collections right to left with an Arabic font', () => {
    const d = design('متجر الأزياء', [item('قائمة المنتجات المتاحة في المتجر', 'GET', '{{u}}/products', ok([{ id: 1, name: 'قميص', price: 1 }])), item('إضافة منتج إلى السلة', 'POST', '{{u}}/cart', ok({}))]);
    assert.equal(d.dir, 'rtl');
    assert.equal(d.theme.font, 'Cairo');
  });
});
