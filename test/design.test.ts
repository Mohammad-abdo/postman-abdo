import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateApp } from '../src/shared/testapp/generate';
import { fieldRoles } from '../src/shared/testapp/design/entities';
import { arabicStoreCollection, deliveryCollection, genericCollection, rideCollection, socialCollection, storeCollection, studentCollection } from './fixtures/domains';
import { item, shopCollection } from './fixtures/shop';

const design = (collection: unknown) => generateApp(collection, { perRequest: true }).schema.design!;
const sectionTypes = (d: ReturnType<typeof design>) => d.screens.home.sections!.map((s) => s.type);

describe('app design: domain detection', () => {
  it('recognises a courier app and builds a driver home', () => {
    const d = design(deliveryCollection());
    assert.equal(d.domain.id, 'delivery');
    assert.equal(d.theme.mode, 'dark');
    assert.ok(d.domain.evidence.length > 0);
    const types = sectionTypes(d);
    assert.ok(types.includes('status'));
    assert.ok(types.includes('map'));
    assert.ok(types.includes('list'));
    const orders = d.entities.order;
    assert.ok(orders, 'orders become an entity even under the /mobile/delivery prefix');
    assert.deepEqual(orders.ctas.map((c) => c.label), ['Accept', 'Picked up', 'Mark delivered']);
    assert.equal(orders.card, 'order');
    assert.equal(orders.roles.title, 'order_number');
    assert.equal(orders.roles.address, 'delivery_address');
    assert.ok(d.auth.login);
    assert.ok(d.auth.me);
    assert.equal(d.tabs[0].screen, 'home');
    assert.equal(d.tabs[d.tabs.length - 1].screen, 'profile');
    assert.ok(d.tabs.some((t) => t.screen.startsWith('page.area-')), 'the collection folders became tabs');
  });

  it('recognises a student app with courses and progress', () => {
    const d = design(studentCollection());
    assert.equal(d.domain.id, 'education');
    const courses = d.entities.course;
    assert.equal(courses.card, 'course');
    assert.equal(courses.roles.progress, 'progress');
    assert.equal(courses.roles.image, 'cover');
    assert.ok(courses.ctas.some((c) => c.label === 'Enroll'));
    assert.ok(sectionTypes(d).includes('greeting'));
    assert.ok(d.screens.home.sections!.some((s) => s.type === 'rail' && s.entity === 'course'));
    assert.equal(d.tabs[1].screen, 'browse.course');
  });

  it('builds a store home from a /home endpoint that returns banners, categories and products', () => {
    const d = design(storeCollection());
    assert.equal(d.domain.id, 'commerce');
    const [search, hero, chips, grid] = d.screens.home.sections!;
    assert.deepEqual([search.type, hero.type, chips.type, grid.type], ['search', 'hero', 'chips', 'grid']);
    assert.ok(!d.screens.home.sections!.some((s) => s.entity === 'cart'), 'the cart has its own screen, not a home section');
    assert.deepEqual(grid.dataPath, ['data', 'products']);
    const product = d.entities.product;
    const addToCart = product.ctas.find((c) => c.label === 'Add to cart');
    assert.ok(addToCart, 'products get an “Add to cart” button that calls the cart endpoint');
    assert.deepEqual(addToCart!.prefill, { product_id: 'item.id' });
    assert.equal(product.roles.oldPrice, 'old_price');
  });

  it('recognises ride hailing, social and Arabic stores', () => {
    assert.equal(design(rideCollection()).domain.id, 'ride');
    assert.equal(design(socialCollection()).domain.id, 'social');
    assert.deepEqual(sectionTypes(design(socialCollection())), ['feed']);
    const arabic = design(arabicStoreCollection());
    assert.equal(arabic.domain.id, 'commerce');
    assert.ok(Object.values(arabic.entities).some((e) => e.kind === 'product'));
  });

  it('falls back to a generic dashboard when nothing is recognisable', () => {
    const d = design(genericCollection());
    assert.equal(d.domain.id, 'generic');
    assert.ok(sectionTypes(d).includes('shortcuts'));
    assert.ok(d.tabs.length >= 3);
  });

  it('keeps every endpoint reachable and is deterministic', () => {
    const collection = shopCollection();
    const a = generateApp(collection, { perRequest: true }).schema;
    const b = generateApp(collection, { perRequest: true }).schema;
    assert.deepEqual(a.design, b.design);
    const reachable = new Set([...Object.values(a.design!.entities).flatMap((e) => e.ops.map((o) => o.action)), ...a.design!.looseActions, ...Object.values(a.design!.auth).filter((v) => typeof v === 'string')]);
    for (const id of Object.keys(a.actions)) assert.ok(reachable.has(id), `${a.actions[id].endpoint} is reachable`);
  });
});

describe('app design: real-world collection shapes', () => {
  const ok = (body: unknown) => ({ examples: [{ code: 200, body }] });
  const courier = () => ({
    info: { name: 'Studify - Mobile Delivery API' },
    auth: { type: 'bearer' },
    item: [
      item('Profile', 'GET', '{{base_url}}/mobile/delivery/profile', ok({ data: { id: 1, name: 'Ali' } })),
      item('Status', 'PUT', '{{base_url}}/mobile/delivery/status', { body: { is_online: true }, ...ok({ success: true }) }),
      item('Assignments', 'GET', '{{base_url}}/mobile/delivery/assignments', ok({ data: [{ id: 5, order_id: 77, status: 'assigned', address: 'Giza' }] })),
      item('Pickup', 'POST', '{{base_url}}/mobile/delivery/orders/:orderId/pickup', ok({ success: true })),
      item('Deliver', 'POST', '{{base_url}}/mobile/delivery/orders/:orderId/deliver', ok({ success: true })),
      item('Unread', 'GET', '{{base_url}}/mobile/delivery/notifications/unread-count', ok({ count: 2 })),
      item('Notifications', 'GET', '{{base_url}}/mobile/delivery/notifications', ok({ data: [{ id: 1, title: 'Hi' }] })),
      item('Read all', 'PUT', '{{base_url}}/mobile/delivery/notifications/read-all', ok({ success: true })),
    ],
  });

  it('reads the app from its path prefix, not the brand name, and puts job actions on the jobs list', () => {
    const d = design(courier());
    assert.equal(d.domain.id, 'delivery');
    const jobs = d.entities.assignment;
    assert.equal(jobs.kind, 'delivery', 'assignments in a courier app are delivery jobs');
    assert.deepEqual(jobs.ctas.map((c) => c.label), ['Picked up', 'Mark delivered']);
    assert.deepEqual(jobs.ctas[0].prefill, { orderId: 'item.order_id' });
    assert.ok(!d.entities.order, 'the action-only orders entity is merged away');
    assert.ok(d.entities.status && !d.entities.statu, '“status” is not singularised');
    assert.ok(!d.entities.unread_count, 'counters belong to their parent resource');
    assert.deepEqual(d.entities.notification.ctas, [], '“read all” is a list action, not an item button');
    assert.ok(d.screens.home.sections!.find((s) => s.type === 'status')?.action, 'PUT /status drives the online toggle');
  });

  it('treats “doctor” as a lecturer in a university app', () => {
    const d = design({
      info: { name: 'Studify Mobile Doctor' },
      item: [
        item('Profile', 'GET', '{{u}}/mobile/doctor/profile', ok({ data: { id: 1, name: 'Dr. Hany' } })),
        item('Colleges', 'GET', '{{u}}/mobile/doctor/colleges', ok({ data: [{ id: 1, name: 'Engineering' }] })),
        item('Books', 'GET', '{{u}}/mobile/doctor/books', ok({ data: [{ id: 1, title: 'Physics', price: 120 }] })),
      ],
    });
    assert.notEqual(d.domain.id, 'health');
  });
});

describe('app design: car services collection (OTP sign-in, filters, categories)', () => {
  const zone = () => ({
    info: { name: 'ZoneCar Customer API' },
    auth: { type: 'bearer' },
    item: [
      { name: '00 Authentication', item: [
        { name: 'A. Register (new customer)', item: [
          item('A1. Register - Request OTP', 'POST', '{{baseUrl}}/api/customer/auth/otp/request', { auth: 'noauth', body: { phone: '{{registrationPhone}}', registration: { name: '{{regName}}', email: '{{regEmail}}', acceptTerms: true } } }),
          item('A3. Register - Verify OTP', 'POST', '{{baseUrl}}/api/customer/auth/otp/verify', { auth: 'noauth', body: { phone: '{{registrationPhone}}', code: '{{otpCode}}' } }),
        ] },
        { name: 'B. Login (existing customer)', item: [
          item('B1. Login - Request OTP', 'POST', '{{baseUrl}}/api/customer/auth/otp/request', { auth: 'noauth', body: { phone: '{{phone}}' } }),
          item('B2. Resend OTP - Login', 'POST', '{{baseUrl}}/api/customer/auth/otp/request', { auth: 'noauth', body: { phone: '{{phone}}' } }),
          item('B3. Login - Verify OTP', 'POST', '{{baseUrl}}/api/customer/auth/otp/verify', { auth: 'noauth', body: { phone: '{{phone}}', code: '{{otpCode}}' } }),
          item('B4. Get My Profile', 'GET', '{{baseUrl}}/api/customer/auth/me'),
        ] },
      ] },
      { name: '01 Vehicles (garage)', item: [
        item('List my vehicles', 'GET', '{{baseUrl}}/api/customer/vehicles?page=1&limit=20'),
        item('Create vehicle', 'POST', '{{baseUrl}}/api/customer/vehicles', { body: { makeId: '{{makeId}}', year: 2021 } }),
      ] },
      { name: '03 Towing', item: [
        item('List my tow requests', 'GET', '{{baseUrl}}/api/customer/towing/requests'),
        item('Cancel tow request', 'POST', '{{baseUrl}}/api/customer/towing/requests/{{towRequestId}}/cancel'),
      ] },
      { name: 'Spare Parts', item: [
        item('List Original categories', 'GET', '{{baseUrl}}/api/customer/categories?section=SPARE_PARTS&quality=ORIGINAL'),
        item('List subcategories', 'GET', '{{baseUrl}}/api/customer/categories?section=SPARE_PARTS&parentId={{originalCategoryId}}&quality=ORIGINAL'),
        item('Products by category', 'GET', '{{baseUrl}}/api/customer/products?section=SPARE_PARTS&quality=ORIGINAL&categoryId={{originalCategoryId}}&inStock=true&minPrice=0&maxPrice=100000&sort=priceAsc&limit=20'),
        item('List products (search, filters, sort)', 'GET', '{{baseUrl}}/api/customer/products?section=SPARE_PARTS&sort=relevance&limit=20'),
        item('Product details', 'GET', '{{baseUrl}}/api/customer/products/{{productId}}'),
        item('Add to favorites', 'PUT', '{{baseUrl}}/api/customer/favorites/products/{{productId}}'),
        item('Add to cart', 'POST', '{{baseUrl}}/api/customer/cart/items', { body: { productId: '{{productId}}', quantity: 1 } }),
      ] },
      { name: 'Maintenance Packages — Customer Journey', item: [item('1. List Maintenance Packages', 'GET', '{{baseUrl}}/api/customer/products?type=MAINTENANCE_PACKAGE&limit=50')] },
    ],
  });
  const generated = () => generateApp(zone(), { perRequest: true }).schema;
  const endpointOf = (schema: ReturnType<typeof generated>, id?: string) => (id ? schema.actions[id].endpoint : undefined);

  it('is a car-services app with phone + code sign-in and a separate sign-up', () => {
    const schema = generated();
    const d = schema.design!;
    assert.equal(d.domain.id, 'automotive');
    assert.deepEqual(d.auth.flows!.login!.map((s) => s.kind), ['identify', 'otp']);
    assert.deepEqual(d.auth.flows!.register!.map((s) => s.kind), ['details', 'otp']);
    assert.match(schema.actions[d.auth.flows!.register![0].action].inputs.map((f) => f.name).join(','), /registration/);
    assert.ok(d.auth.me, '/auth/me is the profile, not a login');
    assert.ok(d.auth.flows!.login![1].resend);
  });

  it('merges every request on /products into one list with real filters', () => {
    const d = generated().design!;
    const list = d.entities.product.ops[0];
    assert.equal(list.intent, 'list');
    const kinds = Object.fromEntries(list.filters!.map((f) => [f.name, f.kind]));
    assert.deepEqual(kinds, { section: 'enum', quality: 'enum', categoryId: 'ref', inStock: 'toggle', minPrice: 'min', maxPrice: 'max', sort: 'sort', type: 'enum' });
    assert.deepEqual(list.filters!.find((f) => f.name === 'sort')!.options!.map((o) => o.label), ['Price: low to high', 'Relevance']);
    assert.ok(list.variants!.length >= 3);
    assert.ok(list.sample?.length, 'no saved responses: the list carries sample rows');
  });

  it('opens a category as a page of its products and sub-categories', () => {
    const d = generated().design!;
    const rel = d.entities.category.relations!;
    assert.ok(rel.find((r) => r.entity === 'product' && r.param === 'categoryId' && r.via === 'query'));
    assert.ok(rel.find((r) => r.self && r.param === 'parentId'));
  });

  it('turns feature folders into services and favorites into a save button', () => {
    const d = generated().design!;
    const services = d.screens.home.sections!.find((s) => s.type === 'shortcuts')!.items!;
    for (const name of ['Vehicles', 'Towing', 'Spare Parts', 'Maintenance Packages']) assert.ok(services.some((s) => s.label === name && s.page), `${name} is an area with its own page`);
    const mp = d.pages!.find((p) => p.title === 'Maintenance Packages')!;
    assert.ok(mp.sections.some((s) => s.values?.type === 'MAINTENANCE_PACKAGE'), 'the folder shows only its slice of the shared list');
    assert.ok(d.entities.towing_request, '“requests” takes its meaning from “towing”');
    assert.ok(d.entities.product.ctas.some((c) => c.label === 'Save to favorites'));
    assert.ok(!d.entities.product.ctas.some((c) => c.label === 'Edit'), 'PUT /favorites/products/{id} is not an edit');
  });
});

describe('app design: field roles', () => {
  it('maps common API field names to visual roles, including nested people and translated text', () => {
    const roles = fieldRoles({ id: 4, name: { en: 'Pizza', ar: 'بيتزا' }, price: '12.50', images: ['https://x/p.png'], customer: { name: 'Mona' }, status: 'new', created_at: '2026-01-01' });
    assert.equal(roles.id, 'id');
    assert.equal(roles.title, 'name');
    assert.equal(roles.price, 'price');
    assert.equal(roles.image, 'images');
    assert.equal(roles.person, 'customer.name');
    assert.equal(roles.status, 'status');
    assert.equal(roles.date, 'created_at');
  });
});

describe('app design: brand colours from the collection', () => {
  const withConfig = (body: unknown, path = '/api/config/theme') => {
    const c = shopCollection() as any;
    c.item.push(item('App theme', 'GET', `https://api.shop.test${path}`, { examples: [{ code: 200, body }] }));
    return c;
  };
  it('uses a primary colour the collection declares, and derives an accent', () => {
    const d = design(withConfig({ primaryColor: '#0A7D5A' }));
    assert.equal(d.theme.primary, '#0A7D5A');
    assert.match(d.theme.accent, /^#[0-9A-F]{6}$/);
    assert.notEqual(d.theme.accent, d.theme.primary);
  });
  it('uses the declared accent as well', () => {
    const d = design(withConfig({ brand: { primary_color: '#2255CC', accentColor: '#FFB020' } }));
    assert.equal(d.theme.primary, '#2255CC');
    assert.equal(d.theme.accent, '#FFB020');
  });
  it('darkens a brand colour that white text cannot read on', () => {
    const d = design(withConfig({ primaryColor: '#FFE066' }));
    assert.notEqual(d.theme.primary, '#FFE066');
  });
  it('ignores a plain colour field outside theme or brand endpoints (a product colour is not the brand)', () => {
    const shirt = (body: unknown) => {
      const c = shopCollection() as any;
      c.item.push(item('Shirt', 'GET', 'https://api.shop.test/api/shirts/1', { examples: [{ code: 200, body }] }));
      return c;
    };
    assert.notEqual(design(shirt({ id: 1, color: '#FF0000' })).theme.primary, '#FF0000');
  });
  it('accepts a plain colour field on a theme endpoint, and ignores near-white colours', () => {
    assert.equal(design(withConfig({ color: '#7C3AED' })).theme.primary, '#7C3AED');
    assert.notEqual(design(withConfig({ primaryColor: '#FFFFFF' })).theme.primary, '#FFFFFF');
  });
});

describe('app design: every collection gets its own look', () => {
  const named = (name: string) => {
    const c = shopCollection() as any;
    c.info.name = name;
    return design(c).theme;
  };
  it('gives different collections of the same business type different designs', () => {
    const names = ['Alpha Store API', 'Zed Market', 'Blue Cart', 'Oak Shop', 'Nile Bazaar', 'Pine Outlet', 'Sun Goods', 'Moon Mart'];
    const looks = names.map(named);
    const signature = (t: ReturnType<typeof named>) => `${t.primary}|${t.style}|${t.font}`;
    assert.ok(new Set(looks.map(signature)).size >= 7, 'at least 7 of 8 shops look different');
    assert.ok(new Set(looks.map((t) => t.primary)).size >= 7, 'colours differ');
    assert.ok(new Set(looks.map((t) => t.style)).size >= 3, 'several styles are used');
    assert.ok(new Set(looks.map((t) => t.font)).size >= 3, 'several fonts are used');
  });
  it('is stable for the same collection', () => {
    assert.deepEqual(named('Alpha Store API'), named('Alpha Store API'));
  });
  it('keeps every generated look readable', async () => {
    const { contrast } = await import('./helpers/contrast');
    for (const n of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 'K', 'L']) {
      const t = named(`Shop ${n}`);
      assert.ok(contrast(t.text, t.background)! >= 4.5, `text on background ${n}`);
      assert.ok(contrast(t.text, t.surface)! >= 4.5, `text on cards ${n}`);
      assert.ok(contrast(t.muted, t.surface)! >= 3, `muted on cards ${n}`);
      assert.ok(contrast(t.mode === 'dark' ? '#04120A' : '#FFFFFF', t.primary)! >= 3, `button text ${n}`);
    }
  });
});

describe('app design: structure comes from the collection folders', () => {
  it('builds a page and a tab per feature area, with sign-in and system folders left out', () => {
    const c = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../ZoneCar Customer API.postman_collection.json'), 'utf8'));
    const d = design(c);
    const titles = d.pages!.map((p) => p.title);
    assert.ok(titles.includes('Towing') && titles.includes('Spare Parts'));
    assert.ok(!titles.some((t) => /auth|sign out/i.test(t)), 'sign-in folders are not areas');
    assert.ok(d.tabs.filter((t) => t.screen.startsWith('page.')).length === 3);
    assert.ok(d.blueprint && ['hub', 'catalog', 'dashboard', 'feed'].includes(d.blueprint.archetype));
    for (const p of d.pages!) assert.ok(p.sections.length > 0, `${p.title} is not empty`);
  });
  it('arranges Home differently per archetype', () => {
    const c = JSON.parse(require('node:fs').readFileSync(require('node:path').join(__dirname, '../../ZoneCar Customer API.postman_collection.json'), 'utf8'));
    const d = design(c);
    const first = d.screens.home.sections!.filter((s) => !['greeting', 'search', 'status'].includes(s.type))[0];
    if (d.blueprint!.archetype === 'hub') assert.equal(first.type, 'shortcuts');
  });
});
