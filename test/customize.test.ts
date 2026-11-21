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

describe('design customizations: code, devices and section looks', () => {
  const base = { v: 1 };
  const parse = (patch: object) => customizationSchema.safeParse({ ...base, ...patch }).success;

  it('accepts custom CSS, code blocks, styled sections and a device', () => {
    assert.equal(parse({
      css: '.na-tabs { border-radius: 0 } .na-banner { background: url(https://cdn.example.com/bg.png) }',
      theme: { iconStyle: 'twotone', template: 'Ocean Glass' },
      device: { model: 'fold', frame: '#C8A27C', orientation: 'landscape', cutout: 'notch', frameless: false },
      home: [
        { id: 'c1', type: 'code', entity: 'product', action: 'send.x', code: { html: '<div id="n"></div>', css: '#n{color:red}', js: 'app.onData(r => n.textContent = r.length)', height: 120 } },
        { id: 'f1', type: 'form', action: 'send.y', title: 'Contact us' },
        { id: 'v1', type: 'video', video: 'https://cdn.example.com/a.mp4', style: { background: '#111111', color: '#FFFFFF', padding: 16, radius: 20, align: 'center', shadow: true, fullBleed: true } },
      ],
    }), true);
  });

  it('rejects CSS that loads or escapes, and unsafe device or style values', () => {
    assert.equal(parse({ css: '@import url(https://evil.example.com/x.css);' }), false);
    assert.equal(parse({ css: '.a { background: url(http://insecure/x.png) }' }), false);
    assert.equal(parse({ css: '.a { background: url(data:image/svg+xml;base64,AAA) }' }), false);
    assert.equal(parse({ css: '</style><script>alert(1)</script>' }), false);
    assert.equal(parse({ css: '.a { behavior: url(x.htc) }' }), false);
    assert.equal(parse({ device: { model: 'nokia3310' } }), false);
    assert.equal(parse({ home: [{ id: 'x', type: 'text', style: { background: 'red;position:fixed' } }] }), false);
    assert.equal(parse({ home: [{ id: 'x', type: 'video', video: 'javascript:alert(1)' }] }), false);
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

describe('finishing touches', () => {
  it('accepts the new theme, splash, audience, animation and field options', () => {
    const ok = customizationSchema.safeParse({
      v: 1,
      theme: { buttonStyle: 'pill', motion: 'lively', pattern: 'dots', gradient: 'vivid' },
      splash: { style: 'gradient', duration: 1500 },
      home: [{ id: 'a', type: 'insights', entity: 'orders', visibility: 'signedIn', animate: 'slide', style: { background: '#112233', background2: '#445566', border: true } }],
      entities: { orders: { hiddenFields: ['notes'], fieldLabels: { total: 'Amount due' } } },
    });
    assert.equal(ok.success, true);
  });
  it('rejects unknown values', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, theme: { buttonStyle: 'blob' } }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, splash: { duration: 99999 } }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'text', visibility: 'nobody' }] }).success, false);
  });
});

describe('data binding and item look', () => {
  it('accepts an endpoint binding with values, filters, sorting and item look', () => {
    const ok = customizationSchema.safeParse({
      v: 1,
      home: [{ id: 'a', type: 'chips', action: 'send.x', values: { categoryId: '3' }, where: [{ field: 'active', op: 'eq', value: 'true' }], sort: { by: 'name', dir: 'asc' }, hidden: true, look: { layout: 'stack', shape: 'circle', size: 'lg', columns: 3, gap: 8, aspect: '1:1', fit: 'contain', hide: ['price'] }, style: { marginTop: 12, opacity: 0.8, titleSize: 20, borderColor: '#cccccc' } }],
      pages: [{ id: 'p', title: 'Page', icon: 'home', background: '#f0f0f0', hideHeader: true, sections: [] }],
    });
    assert.equal(ok.success, true);
  });
  it('rejects bad look values', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'grid', look: { shape: 'triangle' } }] }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'grid', where: [{ field: 'x', op: 'regex', value: '' }] }] }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'grid', style: { opacity: 5 } }] }).success, false);
  });
});

describe('advanced blocks', () => {
  it('accepts faq, gallery, countdown and metrics blocks', () => {
    const ok = customizationSchema.safeParse({
      v: 1,
      home: [
        { id: 'a', type: 'faq', qa: [{ q: 'Why?', a: 'Because.' }] },
        { id: 'b', type: 'gallery', images: ['https://cdn.example.com/a.jpg'] },
        { id: 'c', type: 'countdown', until: '2027-01-01T10:00' },
        { id: 'd', type: 'metrics', metrics: [{ label: 'Customers', value: '10k' }] },
        { id: 'e', type: 'text', body: 'Hi {{me.name}}', action: 'send.x' },
      ],
    });
    assert.equal(ok.success, true);
  });
  it('rejects non-https gallery images and oversized lists', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'b', type: 'gallery', images: ['http://x.com/a.jpg'] }] }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'd', type: 'metrics', metrics: Array.from({ length: 9 }, () => ({ label: 'a', value: 'b' })) }] }).success, false);
  });
});

describe('rules and devices', () => {
  it('accepts showIf and device and rejects unknown operators', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'banner', device: 'wide', showIf: { field: 'count', op: 'gt', value: '0' } }] }).success, true);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'banner', showIf: { field: 'x', op: 'matches' } }] }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'banner', device: 'watch' }] }).success, false);
  });
});

describe('screens: item page, list page, sign-in, transitions', () => {
  it('accepts detail, list, login and transition settings', () => {
    const ok = customizationSchema.safeParse({
      v: 1,
      theme: { transition: 'fade' },
      login: { title: 'Hi', subtitle: 'Welcome', image: 'https://cdn.example.com/a.jpg', style: 'cover', guest: false },
      entities: { product: { detail: { order: ['head', 'image'], hide: ['info'], image: 'inset', cta: 'inline' }, list: { layout: 'grid', columns: 3, search: false, fab: false } } },
    });
    assert.equal(ok.success, true);
  });
  it('rejects unknown parts and non-https cover photos', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, entities: { p: { detail: { order: ['footer'] } } } }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, login: { image: 'http://x.com/a.jpg' } }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, entities: { p: { list: { columns: 9 } } } }).success, false);
  });
});

describe('rules, experiments and tab badges', () => {
  it('accepts a written rule, a variant, the split and tab badges', () => {
    const ok = customizationSchema.safeParse({
      v: 1,
      ab: { name: 'Home test', split: 40 },
      tabs: [{ id: 'home', label: 'Home', icon: 'home', screen: 'home', badge: { mode: 'count', action: 'send.x', hideZero: true } }, { id: 'p', label: 'Profile', icon: 'person', screen: 'profile', badge: { mode: 'dot' } }],
      home: [{ id: 'a', type: 'banner', showExpr: 'count > 0 && me.role == "vip"', variant: 'B' }],
    });
    assert.equal(ok.success, true);
  });
  it('rejects bad variants, splits and badges', () => {
    assert.equal(customizationSchema.safeParse({ v: 1, home: [{ id: 'a', type: 'banner', variant: 'C' }] }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, ab: { split: 100 } }).success, false);
    assert.equal(customizationSchema.safeParse({ v: 1, tabs: [{ id: 'h', label: 'H', icon: 'home', screen: 'home', badge: { mode: 'sparkle' } }] }).success, false);
  });
});
