import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
// the presentation engine is plain JS shared with the renderer
// @ts-ignore
import { choose, columns, configFor, kindOf } from '../../client/src/modules/testapp/native/smart.js';

const day = (n: number) => `2026-03-${String(n).padStart(2, '0')}T10:00:00Z`;

describe('smart presentation', () => {
  it('reads what a column holds', () => {
    assert.equal(kindOf('created_at', ['2026-01-01T10:00:00Z', '2026-01-02']), 'date');
    assert.equal(kindOf('price', [1, 2.5]), 'money');
    assert.equal(kindOf('userId', [1, 2]), 'id');
    assert.equal(kindOf('photo', ['https://x.test/a.jpg', 'https://x.test/b.png']), 'image');
    assert.equal(kindOf('status', ['new', 'done', 'new', 'done']), 'category');
    assert.equal(kindOf('bio', ['x'.repeat(120), 'y'.repeat(100)]), 'longtext');
  });
  it('shows numbers over time as a chart', () => {
    const rows = [1, 2, 3, 4, 5, 6].map((i) => ({ date: day(i), revenue: i * 100 }));
    assert.deepEqual(choose(rows, {}, undefined), { kind: 'chart', x: 'date', y: 'revenue', money: true });
  });
  it('shows a name with one number as bars', () => {
    const rows = [{ name: 'Mon', visits: 4 }, { name: 'Tue', visits: 9 }, { name: 'Wed', visits: 6 }];
    assert.equal(choose(rows, {}, undefined)!.kind, 'chart');
  });
  it('groups work in stages on a board', () => {
    const rows = ['new', 'new', 'packed', 'shipped', 'shipped'].map((status, i) => ({ title: `Job ${i}`, status, label: `x${i}` }));
    assert.equal(choose(rows, { status: 'status', title: 'title' }, 'order')!.kind, 'board');
  });
  it('puts dated events with a status on a timeline', () => {
    const rows = [1, 2, 3].map((i) => ({ title: `Step ${i}`, at: day(i), status: 'done' }));
    assert.equal(choose(rows, {}, 'order')!.kind, 'timeline');
  });
  it('lays events out by day on an agenda', () => {
    const rows = [1, 2, 3, 4, 5].map((i) => ({ title: `Talk ${i}`, starts: day(i), room: 'A' + i }));
    assert.equal(choose(rows, {}, 'event')!.kind, 'agenda');
  });
  it('uses a table for wide, picture-free rows', () => {
    const rows = [1, 2, 3, 4].map((i) => ({ sku: `S${i}`, name: `Part ${i}`, stock: i * 3, warehouse: `W${i}`, supplier: `Co ${i}` }));
    assert.equal(choose(rows, {}, undefined)!.kind, 'table');
  });
  it('uses a gallery for mostly pictures', () => {
    const rows = Array.from({ length: 6 }, (_, i) => ({ id: i + 1, src: `https://x.test/${i}.jpg`, caption: `Photo ${i}` }));
    assert.equal(choose(rows, {}, undefined)!.kind, 'masonry');
  });
  it('reads messages as a conversation and scores as a ranking', () => {
    const chat = [1, 2, 3].map((i) => ({ sender: i % 2 ? 'Ana' : 'Omar', message: `Hello ${i}`, sent: day(i) }));
    assert.equal(choose(chat, {}, undefined)!.kind, 'chat');
    const rank = [{ name: 'A', points: 90 }, { name: 'B', points: 70 }, { name: 'C', points: 50 }];
    assert.equal(choose(rank, {}, undefined)!.kind, 'ranking');
  });
  it('leaves shop-like items as cards', () => {
    const rows = [1, 2, 3, 4].map((i) => ({ name: `Shoe ${i}`, price: 10 * i, image: `https://x.test/${i}.jpg`, rating: 4.5 }));
    assert.equal(choose(rows, { image: 'image', price: 'price', title: 'name' }, 'product'), null);
  });
  it('does not invent a layout for two rows', () => {
    assert.equal(choose([{ a: 1 }, { a: 2 }], {}, undefined), null);
  });
  it('honours a forced presentation when the data can carry it, and refuses when it cannot', () => {
    const rows = [1, 2, 3].map((i) => ({ title: `T${i}`, at: day(i), total: i * 10 }));
    assert.equal(configFor('timeline', rows, {}, undefined)!.kind, 'timeline');
    assert.equal(configFor('masonry', rows, {}, undefined), null);
    assert.equal(columns(rows).length, 3);
  });
});
