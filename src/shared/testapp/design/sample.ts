/**
 * Demo rows for list endpoints that have no saved response, so the generated app shows a
 * believable screen instead of an empty one. The client labels them "Sample data"; they are
 * never sent anywhere and never presented as the backend's format.
 */
import type { DomainId, EntityKind } from './design.types';

const pick = <T>(list: T[], i: number) => list[i % list.length];
const price = (i: number, base: number) => Math.round((base * (1 + ((i * 37) % 9) / 6)) / 5) * 5;
const day = (i: number) => new Date(Date.UTC(2026, 9, 28 - i * 2, 9 + i, 15)).toISOString();

const NAMES = ['Ahmed Hassan', 'Mona Adel', 'Omar Khaled', 'Sara Mahmoud', 'Youssef Ali', 'Nour Samir'];
const PLACES = ['Nasr City, Cairo', 'Maadi, Cairo', 'Zamalek, Cairo', 'Dokki, Giza', 'Heliopolis, Cairo', 'New Cairo'];

const PRODUCTS: Partial<Record<DomainId, string[]>> = {
  automotive: ['Brake pads set', 'Oil filter', 'Iridium spark plugs', 'Cabin air filter', 'Wiper blades', '60Ah car battery', 'Full synthetic oil 5W-30', 'Headlight bulb H7'],
  food: ['Margherita pizza', 'Chicken shawarma', 'Classic burger', 'Caesar salad', 'Koshary bowl', 'Chocolate lava cake'],
  education: ['Physics, 2nd term', 'Organic chemistry notes', 'Calculus workbook', 'English grammar guide', 'Biology atlas', 'Algebra practice set'],
  commerce: ['Wireless earbuds', 'Running sneakers', 'Leather backpack', 'Smart watch', 'Cotton hoodie', 'Ceramic mug set'],
};
const CATEGORIES: Partial<Record<DomainId, string[]>> = {
  automotive: ['Engine', 'Brakes', 'Filters', 'Electrical', 'Suspension', 'Body parts', 'Oils & fluids', 'Lighting'],
  food: ['Pizza', 'Burgers', 'Oriental', 'Desserts', 'Healthy', 'Drinks'],
  education: ['Science', 'Math', 'Languages', 'Engineering', 'Medicine', 'Business'],
  commerce: ['Electronics', 'Fashion', 'Home', 'Sports', 'Beauty', 'Toys'],
};
const VEHICLES = [
  { make: 'Toyota', model: 'Corolla', year: 2021, color: 'White', plate: 'ABC 1234' },
  { make: 'Hyundai', model: 'Elantra', year: 2019, color: 'Silver', plate: 'XYZ 5678' },
  { make: 'Kia', model: 'Sportage', year: 2023, color: 'Blue', plate: 'KLM 9012' },
];
const BANNERS = [
  { title: 'Up to 30% off brake parts', subtitle: 'This week only' },
  { title: 'Free oil change check', subtitle: 'With any maintenance package' },
  { title: 'Tow truck in 20 minutes', subtitle: 'Available 24/7' },
];
const STATUSES = ['pending', 'confirmed', 'in progress', 'completed', 'cancelled'];

/** 6 rows shaped for the entity kind (and app domain), or `undefined` when the kind has no natural sample. */
export function sampleRows(kind: EntityKind, domain: DomainId, label: string, count = 6): unknown[] | undefined {
  const rows = Array.from({ length: count }, (_, i) => i);
  const id = (i: number) => `${kind}-${i + 1}`;
  switch (kind) {
    case 'product':
    case 'menu':
    case 'wishlist': {
      const names = PRODUCTS[domain] || PRODUCTS.commerce!;
      const base = domain === 'automotive' ? 180 : domain === 'food' ? 60 : 250;
      return rows.map((i) => ({ id: id(i), name: pick(names, i), price: price(i, base), old_price: i % 3 === 0 ? price(i, base) + 40 : undefined, rating: 4 + ((i * 3) % 10) / 10, in_stock: i % 5 !== 4 }));
    }
    case 'category':
      return (CATEGORIES[domain] || CATEGORIES.commerce!).slice(0, count).map((name, i) => ({ id: id(i), name }));
    case 'vehicle':
      return VEHICLES.map((v, i) => ({ id: id(i), name: `${v.make} ${v.model}`, subtitle: `${v.year} · ${v.color} · ${v.plate}`, ...v, is_default: i === 0 }));
    case 'banner':
    case 'coupon':
      return BANNERS.map((b, i) => ({ id: id(i), ...b }));
    case 'order':
    case 'booking':
    case 'delivery':
      return rows.slice(0, 4).map((i) => ({ id: id(i), number: `#${(10240 + i * 7).toString()}`, title: `${label} #${10240 + i * 7}`, status: pick(STATUSES, i), total: price(i, 320), created_at: day(i), address: pick(PLACES, i) }));
    case 'trip':
      return rows.slice(0, 4).map((i) => ({ id: id(i), title: `${label} #${3100 + i}`, pickup_address: pick(PLACES, i), dropoff_address: pick(PLACES, i + 2), status: pick(STATUSES, i), fare: price(i, 150), created_at: day(i) }));
    case 'review':
    case 'comment':
      return rows.slice(0, 4).map((i) => ({ id: id(i), author_name: pick(NAMES, i), rating: 5 - (i % 2), comment: pick(['Great quality, fast delivery.', 'Exactly as described.', 'Good value for the price.', 'Would buy again.'], i), created_at: day(i) }));
    case 'notification':
      return rows.slice(0, 4).map((i) => ({ id: id(i), title: pick(['Your order is on the way', 'New offer for you', 'Request confirmed', 'Rate your last order'], i), body: 'Tap to see the details.', read: i > 1, created_at: day(i) }));
    case 'restaurant':
    case 'listing':
    case 'teacher':
    case 'doctor':
    case 'driver':
      return rows.map((i) => ({ id: id(i), name: pick(NAMES, i), rating: 4.2 + (i % 8) / 10, address: pick(PLACES, i) }));
    case 'transaction':
    case 'payment':
      return rows.slice(0, 5).map((i) => ({ id: id(i), title: pick(['Top up', 'Order payment', 'Refund', 'Transfer'], i), amount: price(i, 120) * (i % 2 ? -1 : 1), status: 'completed', created_at: day(i) }));
    case 'other':
      return rows.slice(0, 4).map((i) => ({ id: id(i), name: `${label} ${i + 1}`, status: pick(STATUSES, i), created_at: day(i) }));
    default:
      return undefined;
  }
}

export const sampleProfile = () => ({ id: 'me', name: 'Ahmed Hassan', email: 'ahmed@example.com', phone: '+20 100 123 4567' });
