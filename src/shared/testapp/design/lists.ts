/**
 * Everything a list screen needs beyond "call this endpoint": filter controls gathered from
 * every request that hits the same endpoint, the request variant to use for a filter
 * combination, related lists (products of a category), and app sections from folders.
 */
import type { ActionDef, Endpoint } from '../types';
import type { DesignEntity, DesignFilter, DesignOp, DesignRelation } from './design.types';
import { humanize } from './lexicon';
import { Classified, singular } from './entities';

/** Reference data (`/vehicles/catalog`, `/config`, `/qualities`): fills dropdowns, never a tab or a home section. */
const LOOKUP = /^(catalog|config|configuration|setting|settings|section|quality|qualities|requirement|option|lookup|meta|metadata|enum|type|event|marketplace|session|version|health|status_list)$/;
export const isLookup = (e: DesignEntity) => e.kind === 'setting' || (LOOKUP.test(e.id) && e.ops.every((o) => o.method === 'GET'));

const SERVICE_ICONS: [RegExp, string][] = [
  [/maint|service|repair|workshop/i, 'build'],
  [/insur|policy|warrant/i, 'verified_user'],
  [/tow|roadside|rescue/i, 'local_shipping'],
  [/spare|part/i, 'car_repair'],
  [/vehicle|car|garage/i, 'directions_car'],
];

const PAGING = /^(page|limit|offset|per_?page|page_?size|pagesize|size|cursor|take|skip|after)$/i;
const SEARCH = /^(q|query|search|keyword|keywords|term|s)$/i;
const SORT = /^(sort|sort_?by|sortby|order_?by|orderby|ordering|order)$/i;
const TEMPLATE = /\{\{[^}]*\}\}/;

export const baseKey = (key: string) => key.replace(/#\d+$/, '');
const pathOf = (key: string) => baseKey(key).split(' ')[1] || '';
const literal = (v?: string) => (v !== undefined && v !== '' && !TEMPLATE.test(v) ? v : undefined);

export function sortLabel(value: string) {
  const v = value.replace(/^-/, '');
  const field = humanize(v.replace(/(_?(asc|desc|ascending|descending))$/i, '').replace(/^(asc|desc)_?/i, '')) || 'Default';
  if (/^-|desc/i.test(value)) return /price|cost|amount/i.test(field) ? `${field}: high to low` : /date|created|new/i.test(field) ? 'Newest' : `${field} ↓`;
  if (/asc/i.test(value)) return /price|cost|amount/i.test(field) ? `${field}: low to high` : /date|created/i.test(field) ? 'Oldest' : `${field} ↑`;
  return field;
}

const optionLabel = (v: string) => humanize(v.toLowerCase().replace(/_/g, ' '));

/** Entity a `categoryId` / `vendor_id` / `parentId` parameter points at. */
function refEntity(name: string, self: DesignEntity, entities: Record<string, DesignEntity>) {
  const base = singular(name.replace(/(_?id|Id|ID)$/, '').replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase());
  if (!base || base === name.toLowerCase()) return undefined;
  if (/^(parent|parent_category)$/.test(base)) return self.id;
  if (entities[base]) return base;
  return Object.values(entities).find((e) => e.id.endsWith(`_${base}`) || e.kind === base)?.id;
}

function filtersFor(endpoints: Endpoint[], self: DesignEntity, entities: Record<string, DesignEntity>): DesignFilter[] {
  const values = new Map<string, string[]>();
  for (const ep of endpoints) for (const q of ep.query) {
    if (PAGING.test(q.name)) continue;
    const list = values.get(q.name) || [];
    const v = literal(q.example);
    if (v !== undefined && !list.includes(v)) list.push(v);
    values.set(q.name, list);
  }
  const out: DesignFilter[] = [];
  for (const [name, seen] of values) {
    if (SEARCH.test(name)) out.push({ name, kind: 'search', label: 'Search' });
    else if (SORT.test(name)) out.push({ name, kind: 'sort', label: 'Sort', options: seen.map((v) => ({ value: v, label: sortLabel(v) })) });
    else if (seen.length && seen.every((v) => /^(true|false)$/i.test(v))) out.push({ name, kind: 'toggle', label: humanize(name) });
    else if (/^min|min$/i.test(name)) out.push({ name, kind: 'min', label: humanize(name.replace(/^min_?|_?min$/i, '')) || 'Minimum' });
    else if (/^max|max$/i.test(name)) out.push({ name, kind: 'max', label: humanize(name.replace(/^max_?|_?max$/i, '')) || 'Maximum' });
    else if (/(_id|Id|ID)$/.test(name)) {
      const entity = refEntity(name, self, entities);
      if (entity) out.push({ name, kind: 'ref', label: entities[entity].label, entity });
    } else if (seen.length) out.push({ name, kind: 'enum', label: humanize(name), options: seen.map((v) => ({ value: v, label: optionLabel(v) })) });
  }
  return out;
}

/**
 * One canonical list op per endpoint (the request with the fewest fixed parameters), carrying
 * the merged filters and the other requests as `variants`.
 */
export function enrichLists(entities: Record<string, DesignEntity>, classified: Classified[], actionOf: (key: string) => ActionDef | undefined) {
  const byKey = new Map(classified.map((c) => [c.endpoint.key, c.endpoint]));
  for (const entity of Object.values(entities)) {
    const groups = new Map<string, DesignOp[]>();
    for (const op of entity.ops) if ((op.intent === 'list' || op.intent === 'search') && !op.pathParams.length) groups.set(baseKey(op.endpoint), [...(groups.get(baseKey(op.endpoint)) || []), op]);
    for (const group of groups.values()) {
      const endpoints = group.map((o) => byKey.get(o.endpoint)!).filter(Boolean);
      const fixed = (o: DesignOp) => (byKey.get(o.endpoint)?.query || []).filter((q) => !PAGING.test(q.name) && !SORT.test(q.name)).length + (byKey.get(o.endpoint)?.query || []).filter((q) => TEMPLATE.test(q.example || '')).length * 3;
      const canonical = [...group].sort((a, b) => fixed(a) - fixed(b))[0];
      canonical.intent = 'list';
      canonical.filters = filtersFor(endpoints, entity, entities);
      canonical.variants = group.map((o) => ({ action: o.action, params: (actionOf(o.endpoint)?.inputs || []).filter((f) => f.in === 'query').map((f) => f.name), label: byKey.get(o.endpoint)?.name || o.label }));
      // the canonical op leads so every "list of X" lookup finds it first; the others stay reachable as variants
      entity.ops = [canonical, ...entity.ops.filter((o) => o !== canonical)];
    }
  }
}

/** Lists inside an item page: by query (`/products?categoryId=`) or by path (`/vendors/{id}/reviews`). */
export function buildRelations(entities: Record<string, DesignEntity>) {
  const all = Object.values(entities);
  for (const entity of all) {
    const relations: DesignRelation[] = [];
    for (const other of all) {
      const list = other.ops.find((o) => o.intent === 'list' && !o.pathParams.length && o.filters);
      const ref = list?.filters?.find((f) => f.kind === 'ref' && f.entity === entity.id);
      if (list && ref) {
        const variant = list.variants?.find((v) => v.params.includes(ref.name));
        if (variant) relations.push({ entity: other.id, action: variant.action, param: ref.name, via: 'query', label: other === entity ? `${entity.plural}` : other.plural, self: other === entity });
      }
    }
    const detail = entity.ops.find((o) => o.intent === 'detail' && o.pathParams.length);
    if (detail) {
      const prefix = pathOf(detail.endpoint);
      for (const other of all) {
        for (const op of other.ops) {
          if (!['list', 'single', 'detail'].includes(op.intent) || !op.pathParams.length || op === detail) continue;
          const path = pathOf(op.endpoint);
          if (!path.startsWith(`${prefix}/`) || relations.some((r) => r.action === op.action)) continue;
          const tail = path.slice(prefix.length + 1).split('/').filter((s) => !s.startsWith('{'));
          if (tail.length !== 1 || path.slice(prefix.length + 1).includes('{')) continue;
          if (relations.some((r) => r.entity === other.id && r.via === 'path')) continue;
          relations.push({ entity: other.id, action: op.action, param: op.pathParams[0], via: 'path', label: humanize(tail[0]) });
        }
      }
    }
    if (relations.length) entity.relations = relations;
  }
}

const cleanFolder = (name: string) =>
  name
    .replace(/^[\d.\s_-]+/, '')
    .replace(/\s*[—–]\s.*$/, '')
    .replace(/\s+-\s.*$/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

/** Top-level folders as app sections ("Spare parts", "Towing"…), each opening its main list. */
export function folderServices(classified: Classified[], entities: Record<string, DesignEntity>) {
  const order: string[] = [];
  const byFolder = new Map<string, Classified[]>();
  for (const c of classified) {
    const folder = c.endpoint.folderPath[0];
    if (!folder) continue;
    if (!byFolder.has(folder)) order.push(folder);
    byFolder.set(folder, [...(byFolder.get(folder) || []), c]);
  }
  const items: { label: string; icon: string; entity: string; values?: Record<string, string> }[] = [];
  for (const folder of order) {
    if (/auth|sign|login|regist|logout|account|profile|setting/i.test(folder)) continue;
    const list = byFolder.get(folder)!;
    const counts = new Map<string, number>();
    list.forEach((c) => c.entity && entities[c.entity] && counts.set(c.entity, (counts.get(c.entity) || 0) + 1));
    const main = [...counts.entries()]
      .map(([id, n]) => [entities[id], n] as const)
      .filter(([e]) => e.ops.some((o) => o.intent === 'list' && !o.pathParams.length) && !['user', 'banner', 'cart', 'notification'].includes(e.kind) && !isLookup(e))
      .sort((a, b) => b[1] - a[1])[0]?.[0];
    if (!main) continue;
    // the folder's own request for that list says which slice it is (type=MAINTENANCE_PACKAGE)
    const enums = new Set((main.ops[0].filters || []).filter((f) => f.kind === 'enum').map((f) => f.name));
    const own = list.filter((c) => c.entity === main.id && (c.intent === 'list' || c.intent === 'search') && !c.endpoint.pathParams.length).sort((a, b) => a.endpoint.query.length - b.endpoint.query.length)[0];
    const values = Object.fromEntries((own?.endpoint.query || []).filter((q) => enums.has(q.name) && literal(q.example)).map((q) => [q.name, q.example!]));
    const label = cleanFolder(folder) || main.plural;
    if (items.some((i) => i.label === label)) continue;
    items.push({ label, icon: SERVICE_ICONS.find(([re]) => re.test(label))?.[1] || main.icon, entity: main.id, values: Object.keys(values).length ? values : undefined });
  }
  return items.slice(0, 8);
}
