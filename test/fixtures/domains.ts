/** Small but realistic collections per app domain, used by the design tests. */
import { item } from './shop';

const ok = (body: unknown) => ({ examples: [{ code: 200, body }] });
const collection = (name: string, items: unknown[], auth = 'bearer') => ({ info: { name, schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json' }, auth: { type: auth }, item: items });

/** Courier app, shaped like a "Mobile Delivery API" (driver side). */
export const deliveryCollection = () =>
  collection('Studify - Mobile Delivery API', [
    { name: 'Auth', item: [item('Login', 'POST', '{{base_url}}/mobile/delivery/login', { auth: 'noauth', body: { phone: '0100', password: 'x' }, ...ok({ token: 't', data: { id: 1, name: 'Ali' } }) })] },
    { name: 'Profile', item: [item('Get Profile', 'GET', '{{base_url}}/mobile/delivery/profile', ok({ data: { id: 1, name: 'Ali Hassan', phone: '0100', vehicle_type: 'bike', rating: 4.8 } }))] },
    {
      name: 'Orders',
      item: [
        item('Available orders', 'GET', '{{base_url}}/mobile/delivery/orders', ok({ data: [{ id: 51, order_number: 'ORD-51', status: 'pending', total: 120, customer_name: 'Mona', delivery_address: 'Nasr City', lat: 30.05, lng: 31.33, created_at: '2026-10-01T10:00:00Z' }] })),
        item('Order details', 'GET', '{{base_url}}/mobile/delivery/orders/:id', ok({ data: { id: 51, order_number: 'ORD-51', status: 'pending', total: 120, items: [{ name: 'Book', quantity: 2 }] } })),
        item('Accept order', 'POST', '{{base_url}}/mobile/delivery/orders/:id/accept', ok({ success: true })),
        item('Picked up', 'POST', '{{base_url}}/mobile/delivery/orders/:id/pickup', ok({ success: true })),
        item('Delivered', 'POST', '{{base_url}}/mobile/delivery/orders/:id/deliver', ok({ success: true })),
      ],
    },
    { name: 'Wallet', item: [item('Earnings', 'GET', '{{base_url}}/mobile/delivery/earnings', ok({ data: { today: 340, week: 2100, completed_orders: 18 } }))] },
    item('Go online', 'POST', '{{base_url}}/mobile/delivery/availability/toggle', ok({ online: true })),
  ]);

/** Student app ("Studify Mobile Student"). */
export const studentCollection = () =>
  collection('Studify Mobile Student', [
    item('Login', 'POST', '{{base_url}}/mobile/student/login', { auth: 'noauth', body: { email: 's@x.com', password: 'x' }, ...ok({ token: 't' }) }),
    item('Me', 'GET', '{{base_url}}/mobile/student/me', ok({ data: { id: 3, name: 'Sara Adel', email: 's@x.com', grade_level: '10' } })),
    item('My courses', 'GET', '{{base_url}}/mobile/student/courses', ok({ data: [{ id: 9, title: 'Algebra II', teacher_name: 'Mr. Omar', progress: 45, cover: 'https://cdn.example.com/a.png', lessons_count: 24 }] })),
    item('Course details', 'GET', '{{base_url}}/mobile/student/courses/:id', ok({ data: { id: 9, title: 'Algebra II', description: 'Functions and more' } })),
    item('Enroll', 'POST', '{{base_url}}/mobile/student/courses/:id/enroll', ok({ success: true })),
    item('Lessons', 'GET', '{{base_url}}/mobile/student/lessons', ok({ data: [{ id: 1, title: 'Intro', duration: '12:00', created_at: '2026-10-02T09:00:00Z' }] })),
    item('Exams', 'GET', '{{base_url}}/mobile/student/exams', ok({ data: [{ id: 4, title: 'Midterm', date: '2026-11-01' }] })),
  ]);

/** Store with a `/home` endpoint that returns several lists. */
export const storeCollection = () =>
  collection('My Shop', [
    item('Home', 'GET', '{{url}}/api/v1/home', ok({ data: { banners: [{ id: 1, image: 'https://cdn.example.com/b.png', title: 'Sale' }], categories: [{ id: 2, name: 'Shoes' }], products: [{ id: 3, name: 'Sneaker', price: 99, image: 'https://cdn.example.com/s.png', rating: 4.5 }] } })),
    item('Products', 'GET', '{{url}}/api/v1/products', ok({ data: [{ id: 3, name: 'Sneaker', price: 99, old_price: 120, image: 'https://cdn.example.com/s.png' }] })),
    item('Product', 'GET', '{{url}}/api/v1/products/:id', ok({ data: { id: 3, name: 'Sneaker', price: 99, description: 'Comfy' } })),
    item('Categories', 'GET', '{{url}}/api/v1/categories', ok({ data: [{ id: 2, name: 'Shoes' }] })),
    item('Add to cart', 'POST', '{{url}}/api/v1/cart', { body: { product_id: 3, quantity: 1 }, ...ok({ success: true }) }),
    item('Cart', 'GET', '{{url}}/api/v1/cart', ok({ data: { items: [{ id: 3, name: 'Sneaker', price: 99, quantity: 1 }], total: 99 } })),
    item('Orders', 'GET', '{{url}}/api/v1/orders', ok({ data: [{ id: 7, status: 'shipped', total: 99, created_at: '2026-10-03' }] })),
  ]);

export const rideCollection = () =>
  collection('Ride', [
    item('Request ride', 'POST', '{{url}}/trips', { body: { pickup: 'A', dropoff: 'B' }, ...ok({ id: 1 }) }),
    item('Trips', 'GET', '{{url}}/trips', ok([{ id: 1, pickup_address: 'Zamalek', dropoff_address: 'Maadi', fare: 85, status: 'completed' }])),
    item('Start trip', 'POST', '{{url}}/trips/:id/start', ok({ ok: true })),
    item('Drivers', 'GET', '{{url}}/drivers', ok([{ id: 2, name: 'Karim', rating: 4.9 }])),
  ]);

export const socialCollection = () =>
  collection('Friends', [
    item('Feed', 'GET', '{{url}}/posts', ok([{ id: 1, author_name: 'Nour', caption: 'Hello', image: 'https://cdn.example.com/p.png', likes_count: 3 }])),
    item('Like', 'POST', '{{url}}/posts/:id/like', ok({ ok: true })),
    item('Comments', 'GET', '{{url}}/posts/:id/comments', ok([{ id: 9, body: 'Nice!' }])),
  ]);

/** Arabic names everywhere. */
export const arabicStoreCollection = () =>
  collection('متجر الأزياء', [item('المنتجات', 'GET', '{{url}}/منتجات', ok([{ id: 1, name: 'قميص', price: 250 }])), item('السلة', 'POST', '{{url}}/سلة', ok({ ok: true }))]);

export const genericCollection = () =>
  collection('Inventory sync', [item('Widgets', 'GET', '{{url}}/widgets', ok([{ id: 1, label: 'W1' }])), item('Gadgets', 'GET', '{{url}}/gadgets', ok([{ id: 2, label: 'G2' }]))]);
