import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { generateApp } from '../src/shared/testapp/generate';
import { fieldRoles } from '../src/shared/testapp/design/entities';
import { arabicStoreCollection, deliveryCollection, genericCollection, rideCollection, socialCollection, storeCollection, studentCollection } from './fixtures/domains';
import { shopCollection } from './fixtures/shop';

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
    assert.deepEqual(d.tabs.map((t) => t.screen), ['home', 'browse.order', 'profile']);
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
