import { ActionDef, ApiModel, AppSchema } from '../types';
import { AppDesign, CardStyle, DesignEntity, DesignOp, DesignScreen, DesignSection, DomainId, EntityKind, FieldRoles, Intent, SectionType } from './design.types';
import { Classified, classifyEndpoint, commonPrefix, exampleBody, fieldRoles, findLists, findRecord, isObj, kindOf, singular, tokens } from './entities';
import { buildAuth } from './auth';
import { buildRelations, enrichLists, folderServices } from './lists';
import { sampleProfile, sampleRows } from './sample';
import { DOMAIN_WORDS, DOMAINS, FIELD_HINTS, humanize, kindDef, VERBS } from './lexicon';

/**
 * Collection → app design: decide what kind of app this API powers (store, courier, school…), then compose
 * screens, tabs and buttons that make it feel like that kind of app. Deterministic and pure.
 */

const MAX_HOME_SECTIONS = 8;
const MIN_DOMAIN_SCORE = 2.5;


function pluralize(label: string) {
  if (/[^aeiou]y$/i.test(label)) return label.replace(/y$/i, 'ies');
  if (/(s|x|ch|sh)$/i.test(label)) return `${label}es`;
  if (/[؀-ۿ]/.test(label)) return label;
  return `${label}s`;
}

/* ------------------------------------ domain ------------------------------------ */

export function classifyDomain(model: ApiModel, classified: Classified[], prefix: string[] = []): AppDesign['domain'] {
  const scores = Object.fromEntries(Object.keys(DOMAINS).map((d) => [d, 0])) as Record<DomainId, number>;
  const reasons: { domain: DomainId; weight: number; text: string }[] = [];
  const vote = (votes: Partial<Record<DomainId, number>>, factor: number, text: string) => {
    for (const [domain, weight] of Object.entries(votes) as [DomainId, number][]) {
      scores[domain] += weight * factor;
      reasons.push({ domain, weight: weight * factor, text });
    }
  };

  // 1. entities (each distinct entity once, extra endpoints add a little)
  const perEntity = new Map<string, { kind: EntityKind; count: number }>();
  classified.forEach((c) => c.entity && perEntity.set(c.entity, { kind: c.kind, count: (perEntity.get(c.entity)?.count || 0) + 1 }));
  perEntity.forEach(({ kind, count }, entity) => vote(kindDef(kind).votes, 1 + Math.min(count - 1, 4) * 0.15, `“${entity}” endpoints`));

  // 2. verbs at the end of paths
  classified.forEach((c) => {
    const verb = c.verb && VERBS.find((v) => v.label === c.verb);
    if (verb) vote(verb.votes, 0.6, `“${c.verb}” action`);
  });

  // 3. explicit domain words in the collection, folder names and paths
  const words = new Set<string>([
    ...tokens(model.meta.name),
    ...model.endpoints.flatMap((e) => [...e.folderPath.flatMap(tokens), ...e.segments.filter((s) => !s.startsWith('{')).flatMap(tokens)]),
  ]);
  const prefixWords = new Set(prefix.flatMap(tokens));
  for (const word of words) {
    const where = prefixWords.has(word) ? 2.5 : 1;
    for (const d of DOMAIN_WORDS) if (d.words.test(word)) vote({ [d.domain]: d.weight }, where, prefixWords.has(word) ? `every path starts with “${word}”` : `the word “${word}”`);
  }

  // 4. response fields
  const keys = new Set<string>();
  model.endpoints.forEach((e) => {
    const body = exampleBody(e);
    const sample = findLists(body)[0]?.rows[0] || findRecord(body)?.record;
    if (isObj(sample)) Object.keys(sample).slice(0, 30).forEach((k) => keys.add(k.toLowerCase()));
  });
  for (const key of keys) for (const hint of FIELD_HINTS) if (hint.words.test(key)) vote(hint.votes, 0.5, `“${key}” fields`);

  const ranked = (Object.entries(scores) as [DomainId, number][]).filter(([d]) => d !== 'generic').sort((a, b) => b[1] - a[1]);
  const [top, second] = ranked;
  const winner: DomainId = top && top[1] >= MIN_DOMAIN_SCORE ? top[0] : 'generic';
  const confidence = winner === 'generic' ? 0 : Math.round((top[1] / (top[1] + (second?.[1] || 0) + 1)) * 100) / 100;
  const evidence = reasons
    .filter((r) => r.domain === winner)
    .sort((a, b) => b.weight - a.weight)
    .map((r) => r.text)
    .filter((text, i, all) => all.indexOf(text) === i)
    .slice(0, 6);
  return {
    id: winner,
    label: DOMAINS[winner].label,
    confidence,
    evidence,
    scores: Object.fromEntries(ranked.filter(([, s]) => s > 0).map(([d, s]) => [d, Math.round(s * 10) / 10])),
  };
}

/* ------------------------------------ entities ------------------------------------ */

const CREATE_LABEL: Partial<Record<EntityKind, string>> = {
  cart: 'Add to cart',
  order: 'Place order',
  booking: 'Book now',
  post: 'New post',
  comment: 'Comment',
  review: 'Write a review',
  address: 'Add address',
  wishlist: 'Save',
  message: 'Send message',
  transaction: 'New transfer',
  task: 'New task',
  trip: 'Request a ride',
};

function opLabel(intent: Intent, kind: EntityKind, label: string, plural: string, verb?: string, lastWord?: string) {
  switch (intent) {
    case 'list':
      return plural;
    case 'detail':
    case 'single':
      return label;
    case 'create':
      return CREATE_LABEL[kind] || `New ${label.toLowerCase()}`;
    case 'update':
      return 'Edit';
    case 'delete':
      return 'Delete';
    case 'search':
      return `Search ${plural.toLowerCase()}`;
    case 'action':
      return verb || humanize(lastWord || 'Run');
    case 'login':
      return 'Sign in';
    case 'register':
      return 'Create account';
    case 'otp':
      return 'Verify';
    case 'logout':
      return 'Log out';
    case 'me':
      return 'My profile';
    case 'updateProfile':
      return 'Edit profile';
    default:
      return label;
  }
}

/** The card that best shows an entity, given its kind and the fields its items actually have. */
function cardFor(kind: EntityKind, roles: FieldRoles): CardStyle {
  const base = kindDef(kind).card;
  if (kind !== 'other') return base;
  if (roles.price && roles.image) return 'product';
  if ((roles.address || roles.lat) && roles.status) return 'order';
  if (roles.progress) return 'course';
  if (roles.email || roles.phone) return 'person';
  if (roles.image && roles.description) return 'article';
  return 'tile';
}

function buildOp(c: Classified, action: ActionDef, label: string, plural: string): DesignOp {
  const body = exampleBody(c.endpoint);
  let dataPath: string[] = [];
  let roles: FieldRoles = {};
  if (c.intent === 'list' || c.intent === 'search') {
    const list = findLists(body)[0];
    if (list) {
      dataPath = list.path;
      roles = fieldRoles(list.rows[0]);
    }
  } else if (['detail', 'single', 'me'].includes(c.intent)) {
    const record = findRecord(body);
    if (record) {
      dataPath = record.path;
      roles = fieldRoles(record.record);
    }
  }
  const lastLiteral = [...c.endpoint.segments].reverse().find((s) => !s.startsWith('{'));
  const verbDef = c.verb ? VERBS.find((v) => v.label === c.verb) : undefined;
  return {
    action: action.id,
    endpoint: c.endpoint.key,
    method: c.endpoint.method,
    intent: c.intent,
    label: opLabel(c.intent, c.kind, label, plural, c.verb, lastLiteral),
    verb: c.verb,
    dataPath,
    roles,
    pathParams: c.endpoint.pathParams.map((p) => p.name),
    inputs: action.inputs.filter((f) => f.in === 'body' || f.in === 'form' || (f.in === 'query' && !/^(page|limit|offset|per_?page|page_?size|cursor)$/i.test(f.name))).map((f) => f.name),
    destructive: c.intent === 'delete' || !!verbDef?.destructive,
  };
}

const JOB_KINDS: EntityKind[] = ['order', 'delivery', 'trip', 'booking'];

const ID_INPUT = (kind: EntityKind) => new RegExp(`^(${kind}|item|product|course|listing|room|doctor|event|menu|dish|post)_?id$|^id$`, 'i');

/** Groups classified endpoints into entities with their operations and detail-screen buttons. */
function buildEntities(classified: Classified[], actionOf: (key: string) => ActionDef | undefined) {
  // (classified is also read below to find sample rows)
  const groups = new Map<string, Classified[]>();
  classified.forEach((c) => c.entity && actionOf(c.endpoint.key) && groups.set(c.entity, [...(groups.get(c.entity) || []), c]));

  const entities: Record<string, DesignEntity> = {};
  groups.forEach((list, id) => {
    const kind = list.map((c) => c.kind).find((k) => k !== 'other') || 'other';
    const def = kindDef(kind);
    const label = kind === 'user' ? 'Profile' : /[؀-ۿ]/.test(id) ? id : humanize(singular(id));
    const plural = kind === 'user' ? 'Profile' : pluralize(label);
    const ops = list.map((c) => buildOp(c, actionOf(c.endpoint.key)!, label, plural));
    const roles = { ...(ops.find((o) => o.intent === 'detail')?.roles || {}), ...(ops.find((o) => o.intent === 'list' || o.intent === 'search')?.roles || {}) };
    entities[id] = { id, kind, label, plural, icon: def.icon, card: cardFor(kind, roles), roles, ops, ctas: [] };
  });

  // `POST /orders/{orderId}/pickup` with no orders list belongs on the list that shows the jobs (assignments, deliveries…).
  const prefillOf = new Map<string, Record<string, string>>();
  const sampleOf = (entity: DesignEntity) => {
    const op = entity.ops.find((o) => o.intent === 'list');
    const c = op && classified.find((x) => x.endpoint.key === op.endpoint);
    const row = c && findLists(exampleBody(c.endpoint))[0]?.rows[0];
    return isObj(row) ? row : {};
  };
  for (const orphan of Object.values(entities)) {
    if (!JOB_KINDS.includes(orphan.kind) || orphan.ops.some((o) => o.intent !== 'action')) continue;
    const host = Object.values(entities).find((e) => e !== orphan && JOB_KINDS.includes(e.kind) && e.ops.some((o) => o.intent === 'list'));
    if (!host) continue;
    const sample = sampleOf(host);
    for (const op of orphan.ops) {
      const map: Record<string, string> = {};
      for (const param of op.pathParams) {
        const snake = param.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
        const field = [param, snake, `${orphan.id}_id`, `${orphan.id}Id`].find((f) => f in sample) || (isObj(sample[orphan.id]) && 'id' in (sample[orphan.id] as object) ? `${orphan.id}.id` : undefined);
        if (field) map[param] = `item.${field}`;
      }
      if (Object.keys(map).length) prefillOf.set(op.action, map);
      host.ops.push(op);
    }
    delete entities[orphan.id];
  }

  // detail-screen buttons: own actions first, then helpful cross-entity ones
  const all = Object.values(entities);
  const createOf = (kinds: EntityKind[]) => all.flatMap((e) => (kinds.includes(e.kind) ? e.ops.filter((o) => o.intent === 'create') : []))[0];
  const verbOf = (pattern: RegExp) => all.flatMap((e) => e.ops.filter((o) => o.intent === 'action' && pattern.test(o.verb || '')))[0];
  for (const entity of all) {
    for (const op of entity.ops) {
      if (op.intent === 'action' && op.pathParams.length) entity.ctas.push({ label: op.label, action: op.action, style: op.destructive ? 'danger' : 'primary', icon: VERBS.find((v) => v.label === op.verb)?.icon || 'bolt', prefill: prefillOf.get(op.action) });
    }
    const cross: [EntityKind[], ReturnType<typeof createOf>, string, string][] = [];
    if (['product', 'menu'].includes(entity.kind)) cross.push([['cart'], createOf(['cart', 'order']), 'Add to cart', 'add_shopping_cart'], [['wishlist'], createOf(['wishlist']), 'Save', 'favorite_border']);
    if (entity.kind === 'course') cross.push([['course'], verbOf(/enroll/i) || createOf(['student']), 'Enroll now', 'how_to_reg']);
    if (['listing', 'doctor', 'event'].includes(entity.kind)) cross.push([['booking'], createOf(['booking']), entity.kind === 'event' ? 'Get tickets' : 'Book now', 'event_available']);
    for (const [, op, label, icon] of cross) {
      if (!op || entity.ctas.some((c) => c.action === op.action) || entity.ops.includes(op)) continue;
      const target = all.find((e) => e.ops.includes(op));
      const idInput = target && actionOf(op.endpoint)?.inputs.find((f) => ID_INPUT(entity.kind).test(f.name));
      entity.ctas.push({ label, action: op.action, style: entity.ctas.length ? 'secondary' : 'primary', icon, prefill: idInput ? { [idInput.name]: 'item.id' } : undefined });
    }
    const update = entity.ops.find((o) => o.intent === 'update');
    if (update) entity.ctas.push({ label: 'Edit', action: update.action, style: 'secondary', icon: 'edit' });
    const remove = entity.ops.find((o) => o.intent === 'delete');
    if (remove) entity.ctas.push({ label: 'Delete', action: remove.action, style: 'danger', icon: 'delete' });
  }
  return entities;
}

/* ------------------------------------ screens ------------------------------------ */

const SINGULAR_TAB = new Set<EntityKind>(['cart', 'wallet', 'wishlist', 'setting']);
const rootListOp = (e?: DesignEntity) => e?.ops.find((o) => (o.intent === 'list' || o.intent === 'search') && !o.pathParams.length);
const listOp = (e?: DesignEntity) => e?.ops.find((o) => o.intent === 'list') || e?.ops.find((o) => o.intent === 'search');
const singleOp = (e?: DesignEntity) => e?.ops.find((o) => o.intent === 'single' || o.intent === 'me') || e?.ops.find((o) => o.intent === 'detail' && !o.pathParams.length);

type Spec = { type: SectionType; kinds?: EntityKind[]; title?: string; card?: CardStyle; limit?: number };

const HOME: Record<DomainId, Spec[]> = {
  commerce: [{ type: 'search' }, { type: 'hero', kinds: ['banner', 'coupon'] }, { type: 'chips', kinds: ['category'], title: 'Categories' }, { type: 'grid', kinds: ['product', 'menu', 'wishlist'], title: 'Popular now' }, { type: 'rail', kinds: ['restaurant', 'listing'] }, { type: 'list', kinds: ['order'], title: 'Recent orders', limit: 3 }],
  food: [{ type: 'search' }, { type: 'chips', kinds: ['category'], title: 'Cravings' }, { type: 'hero', kinds: ['banner', 'coupon'] }, { type: 'rail', kinds: ['restaurant'], title: 'Near you' }, { type: 'grid', kinds: ['menu', 'product'], title: 'Popular dishes' }, { type: 'list', kinds: ['order'], title: 'Your orders', limit: 3 }],
  delivery: [{ type: 'greeting' }, { type: 'status' }, { type: 'stats', kinds: ['wallet', 'transaction', 'other'] }, { type: 'map', kinds: ['order', 'delivery', 'trip'] }, { type: 'list', kinds: ['order', 'delivery', 'trip'], title: 'Active orders', limit: 4 }, { type: 'list', kinds: ['notification'], title: 'Updates', limit: 3 }],
  ride: [{ type: 'map', kinds: ['trip', 'order'] }, { type: 'shortcuts' }, { type: 'list', kinds: ['trip', 'order'], title: 'Recent trips', limit: 4 }],
  education: [{ type: 'greeting' }, { type: 'stats', kinds: ['grade', 'wallet', 'other'] }, { type: 'rail', kinds: ['course'], title: 'Continue learning' }, { type: 'list', kinds: ['schedule', 'lesson', 'assignment', 'quiz'], title: 'Up next', limit: 4 }, { type: 'list', kinds: ['grade'], title: 'Latest grades', limit: 3 }, { type: 'rail', kinds: ['teacher'], title: 'Your teachers' }],
  social: [{ type: 'feed', kinds: ['post'] }],
  booking: [{ type: 'search' }, { type: 'chips', kinds: ['category'] }, { type: 'grid', kinds: ['listing'], title: 'Recommended stays' }, { type: 'list', kinds: ['booking'], title: 'Upcoming bookings', limit: 3 }],
  finance: [{ type: 'greeting' }, { type: 'balance', kinds: ['wallet', 'user'] }, { type: 'shortcuts' }, { type: 'list', kinds: ['transaction', 'payment'], title: 'Recent activity', limit: 6 }],
  health: [{ type: 'greeting' }, { type: 'search' }, { type: 'rail', kinds: ['doctor'], title: 'Top doctors' }, { type: 'list', kinds: ['booking', 'schedule'], title: 'Upcoming appointments', limit: 3 }],
  realestate: [{ type: 'search' }, { type: 'chips', kinds: ['category'] }, { type: 'grid', kinds: ['listing'], title: 'Featured homes' }],
  news: [{ type: 'hero', kinds: ['article', 'banner'] }, { type: 'chips', kinds: ['category'] }, { type: 'list', kinds: ['article'], title: 'Latest', limit: 8 }],
  tasks: [{ type: 'greeting' }, { type: 'stats', kinds: ['other'] }, { type: 'list', kinds: ['task'], title: 'Your tasks', limit: 6 }, { type: 'rail', kinds: ['project'], title: 'Projects' }],
  events: [{ type: 'hero', kinds: ['event', 'banner'] }, { type: 'chips', kinds: ['category'] }, { type: 'list', kinds: ['event'], title: 'This week', limit: 5 }, { type: 'list', kinds: ['booking'], title: 'Your tickets', limit: 3 }],
  automotive: [{ type: 'greeting' }, { type: 'rail', kinds: ['vehicle'], title: 'My garage' }, { type: 'shortcuts' }, { type: 'hero', kinds: ['banner', 'coupon'] }, { type: 'chips', kinds: ['category'], title: 'Shop by category' }, { type: 'grid', kinds: ['product'], title: 'Popular parts' }, { type: 'list', kinds: ['trip', 'order'], title: 'Recent requests', limit: 3 }],
  generic: [{ type: 'greeting' }, { type: 'shortcuts' }],
};

const SECTION_RANK: SectionType[] = ['hero', 'chips', 'rail', 'grid', 'list'];
const TOP_SECTIONS: SectionType[] = ['greeting', 'search', 'status'];
/** Kinds that belong to their own screen (profile, cart, settings) rather than the home feed. */
const NOT_ON_HOME = new Set<EntityKind>(['user', 'setting', 'cart']);
const COMPOSITE_SECTION: Partial<Record<CardStyle, SectionType>> = { banner: 'hero', chip: 'chips', product: 'grid', venue: 'rail', course: 'rail', event: 'rail', person: 'rail' };

function composeHome(domain: DomainId, entities: Record<string, DesignEntity>, composite: Classified[], actionOf: (key: string) => ActionDef | undefined, tabFor: (entity: string) => string | undefined, services: NonNullable<DesignSection['items']> = []) {
  const sections: DesignSection[] = [];
  const used = new Set<string>();
  const all = Object.values(entities);
  const byKinds = (kinds: EntityKind[], need: 'list' | 'single') =>
    kinds.flatMap((k) => all.filter((e) => e.kind === k && !used.has(e.id) && (need === 'list' ? listOp(e) : singleOp(e))))[0];
  const add = (section: Omit<DesignSection, 'id'>) => sections.push({ ...section, id: `home.${sections.length}` });

  // A /home or /dashboard endpoint returning several lists describes the home screen best: use it first.
  for (const c of composite) {
    const action = actionOf(c.endpoint.key);
    if (!action) continue;
    const lists = findLists(exampleBody(c.endpoint)).slice(0, 6).map((list) => {
      const key = list.path[list.path.length - 1] || 'items';
      const kind = kindOf(key);
      const roles = fieldRoles(list.rows[0]);
      const card = cardFor(kind, roles);
      return { list, key, kind, roles, card, type: COMPOSITE_SECTION[card] || ('list' as SectionType) };
    });
    // Present them the way shopping/food apps do: banners, then categories, then rails and grids, then plain lists.
    lists.sort((a, b) => SECTION_RANK.indexOf(a.type) - SECTION_RANK.indexOf(b.type));
    for (const { list, key, kind, roles, card, type } of lists) {
      const owner = all.find((e) => e.kind === kind && kind !== 'other');
      add({ type, title: humanize(key), action: action.id, dataPath: list.path, roles, card, entity: owner?.id, limit: 6, seeAll: owner ? tabFor(owner.id) : undefined });
      if (owner) used.add(owner.id);
    }
  }

  // Collections organised in feature folders ("Towing", "Spare parts"…) get those as the app's services.
  const specs = HOME[domain].some((s) => s.type === 'shortcuts') || services.length < 3 ? HOME[domain] : [...HOME[domain].filter((s) => TOP_SECTIONS.includes(s.type)), { type: 'shortcuts' as const }, ...HOME[domain].filter((s) => !TOP_SECTIONS.includes(s.type))];
  for (const spec of specs) {
    if (sections.length >= MAX_HOME_SECTIONS) break;
    if (spec.type === 'greeting' || spec.type === 'search' || spec.type === 'status') {
      if (spec.type === 'search' && !all.some((e) => listOp(e))) continue;
      const toggle = all.flatMap((e) => e.ops).find((o) => /online/i.test(o.verb || '')) || all.filter((e) => /^(status|availability|availabilit|online|shift|duty)$/.test(e.id)).flatMap((e) => e.ops).find((o) => o.method !== 'GET');
      if (spec.type === 'status' && !toggle) {
        add({ type: 'status', title: 'Ready for orders' });
        continue;
      }
      add({ type: spec.type, action: toggle?.action });
      continue;
    }
    if (spec.type === 'shortcuts') {
      if (services.length >= 2) {
        add({ type: 'shortcuts', title: 'Services', items: services });
        continue;
      }
      const items = domain === 'generic'
        ? all.filter((e) => listOp(e) && e.kind !== 'user').slice(0, 8).map((e) => ({ label: e.plural, icon: e.icon, entity: e.id }))
        : all.flatMap((e) => e.ops.filter((o) => o.intent === 'create').map((o) => ({ label: o.label, icon: e.icon, action: o.action, entity: e.id }))).slice(0, 4);
      if (items.length) add({ type: 'shortcuts', title: domain === 'generic' ? 'Explore' : 'Quick actions', items });
      continue;
    }
    if (spec.type === 'stats' || spec.type === 'balance') {
      const entity = byKinds(spec.kinds || [], 'single');
      const op = singleOp(entity);
      if (!entity || !op) continue;
      used.add(entity.id);
      add({ type: spec.type, title: entity.label, entity: entity.id, action: op.action, dataPath: op.dataPath, roles: op.roles });
      continue;
    }
    const entity = byKinds(spec.kinds || [], 'list');
    const op = listOp(entity);
    if (!entity || !op) continue;
    if (spec.type !== 'map') used.add(entity.id);
    add({
      type: spec.type,
      title: spec.title || entity.plural,
      entity: entity.id,
      action: op.action,
      dataPath: op.dataPath,
      roles: op.roles,
      card: spec.type === 'chips' ? 'chip' : spec.type === 'hero' ? 'banner' : entity.card,
      limit: spec.limit ?? (spec.type === 'grid' ? 6 : spec.type === 'rail' ? 8 : 5),
      seeAll: tabFor(entity.id),
    });
  }

  // Lists the template did not place still deserve a spot (most specific domains leave few behind).
  for (const entity of all) {
    if (sections.length >= MAX_HOME_SECTIONS) break;
    const op = listOp(entity);
    if (!op || op.pathParams.length || used.has(entity.id) || NOT_ON_HOME.has(entity.kind)) continue;
    used.add(entity.id);
    const type: SectionType = entity.card === 'product' ? 'grid' : ['venue', 'course', 'event', 'person'].includes(entity.card) ? 'rail' : 'list';
    add({ type, title: entity.plural, entity: entity.id, action: op.action, dataPath: op.dataPath, roles: op.roles, card: entity.card, limit: type === 'list' ? 4 : 6, seeAll: tabFor(entity.id) });
  }
  // Greeting, search and the online toggle always sit at the top, above content from a /home endpoint.
  const top = (t: SectionType) => (TOP_SECTIONS.includes(t) ? TOP_SECTIONS.indexOf(t) : TOP_SECTIONS.length);
  return sections.map((s, i) => ({ s, i })).sort((a, b) => top(a.s.type) - top(b.s.type) || a.i - b.i).map(({ s }, i) => ({ ...s, id: `home.${i}` }));
}

/* ------------------------------------ samples ------------------------------------ */

/** Lists with no saved response get demo rows (and roles read from them) so screens are never blank. */
function addSamples(entities: Record<string, DesignEntity>, domain: DomainId, classified: Classified[]) {
  const byKey = new Map(classified.map((c) => [c.endpoint.key, c.endpoint]));
  for (const entity of Object.values(entities)) {
    for (const op of entity.ops) {
      const endpoint = byKey.get(op.endpoint);
      if (!endpoint || exampleBody(endpoint) !== undefined) continue;
      if (op.intent === 'me') {
        op.sample = [sampleProfile()];
        op.roles = { ...fieldRoles(op.sample[0] as Record<string, unknown>), ...op.roles };
        continue;
      }
      if (op.intent !== 'list' || op.sample) continue;
      const rows = sampleRows(entity.kind, domain, entity.label);
      if (!rows) continue;
      op.sample = rows;
      op.roles = { ...fieldRoles(rows[0] as Record<string, unknown>), ...op.roles };
    }
    const list = entity.ops.find((o) => o.intent === 'list' && o.sample);
    if (list && !entity.roles.title) {
      entity.roles = { ...list.roles, ...entity.roles };
      entity.card = cardFor(entity.kind, entity.roles);
    }
  }
}

/* ------------------------------------- build ------------------------------------- */

export function buildDesign(model: ApiModel, schema: Pick<AppSchema, 'actions' | 'app'>): AppDesign {
  const actionByEndpoint = new Map(Object.values(schema.actions).map((a) => [a.endpoint, a]));
  const actionOf = (key: string) => actionByEndpoint.get(key);
  const prefix = commonPrefix(model.endpoints);
  const academic = model.endpoints.some((e) => e.segments.some((s) => /^(college|faculty|facult|department|semester|lecture|university|course)s?$/i.test(s)));
  const classified = model.endpoints.map((e) => classifyEndpoint(e, prefix)).map((c) => (academic && c.kind === 'doctor' ? { ...c, kind: 'teacher' as EntityKind } : c));
  const domain = classifyDomain(model, classified, prefix);
  const def = DOMAINS[domain.id];
  // In courier and ride apps an "assignment" is a delivery job, not homework.
  const jobs = domain.id === 'delivery' || domain.id === 'ride';
  const entities = buildEntities(jobs ? classified.map((c) => (c.kind === 'assignment' ? { ...c, kind: 'delivery' as EntityKind } : c)) : classified, actionOf);

  enrichLists(entities, classified, actionOf);
  buildRelations(entities);
  addSamples(entities, domain.id, classified);

  // auth: password logins, phone + code flows, registrations
  const profile = entities.profile;
  const auth = buildAuth(classified, actionOf, profile?.ops || []);
  const protectedShare = model.endpoints.filter((e) => e.auth.type && e.auth.type !== 'noauth').length / Math.max(model.endpoints.length, 1);
  auth.required = !!auth.login && protectedShare >= 0.3;

  // tabs: home + the domain's key entities + profile/more
  const tabs: AppDesign['tabs'] = [{ id: 'home', label: def.homeLabel, icon: 'home', screen: 'home' }];
  const screens: Record<string, DesignScreen> = {};
  const tabbed = new Set<string>();
  const listEntities = Object.values(entities).filter((e) => rootListOp(e) && e.kind !== 'user');
  const addBrowseTab = (entity: DesignEntity) => {
    if (tabbed.has(entity.id) || tabs.length >= 4) return;
    tabbed.add(entity.id);
    const screen = `browse.${entity.id}`;
    screens[screen] = { id: screen, kind: 'browse', title: entity.plural, entity: entity.id };
    tabs.push({ id: screen, label: entity.plural.length > 11 || SINGULAR_TAB.has(entity.kind) ? entity.label : entity.plural, icon: entity.icon, screen });
  };
  for (const group of def.tabKinds) {
    const entity = group.flatMap((k) => listEntities.filter((e) => e.kind === k))[0];
    if (entity) addBrowseTab(entity);
  }
  if (domain.id === 'generic' || tabs.length < 3) {
    [...listEntities].sort((a, b) => b.ops.length - a.ops.length).forEach(addBrowseTab);
  }
  const tabFor = (entity: string) => `browse.${entity}`;

  // every list entity gets a browse screen (reachable from "See all" and the More/Profile menus)
  for (const entity of listEntities) {
    const id = `browse.${entity.id}`;
    screens[id] ||= { id, kind: 'browse', title: entity.plural, entity: entity.id };
  }

  screens.home = {
    id: 'home',
    kind: 'home',
    title: def.homeLabel,
    sections: composeHome(domain.id, entities, classified.filter((c) => c.intent === 'composite'), actionOf, tabFor, folderServices(classified, entities)),
  };
  screens.profile = { id: 'profile', kind: 'profile', title: 'Profile' };
  tabs.push({ id: 'profile', label: auth.me || auth.login ? 'Profile' : 'More', icon: auth.me || auth.login ? 'person' : 'menu', screen: 'profile' });

  const covered = new Set<string>([
    ...Object.values(entities).flatMap((e) => e.ops.map((o) => o.action)),
    ...Object.values(auth).filter((v): v is string => typeof v === 'string'),
    ...classified.filter((c) => c.intent === 'composite').map((c) => actionOf(c.endpoint.key)?.id).filter((v): v is string => !!v),
  ]);

  return {
    version: 1,
    domain,
    brand: { name: schema.app.name.replace(/\s*[—–-]\s*Test App$/i, '').replace(/\b(api|collection|postman)\b/gi, '').replace(/\s{2,}/g, ' ').trim() || 'My App', tagline: def.tagline, icon: def.icon },
    theme: def.theme,
    auth,
    tabs,
    screens,
    entities,
    looseActions: Object.keys(schema.actions).filter((id) => !covered.has(id)),
  };
}


/** Versions saved before app designs existed get one computed on read; a failure never breaks loading. */
export function withDesign<T extends Pick<AppSchema, 'actions' | 'app'> & { design?: AppDesign }>(schema: T, model: unknown): T {
  if (!schema || schema.design || !model) return schema;
  try {
    return { ...schema, design: buildDesign(model as ApiModel, schema) };
  } catch {
    return schema;
  }
}
