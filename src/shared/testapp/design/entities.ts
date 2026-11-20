import { Endpoint } from '../types';
import { EntityKind, FieldRoles, Intent } from './design.types';
import { KINDS, VERBS } from './lexicon';

/** Turns endpoints into "entities the app shows" plus what each endpoint does to them. Pure. */

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const isParam = (segment: string) => /^\{.+\}$/.test(segment);

/** Generic words that never name an entity on their own (the parent segment does). */
const GENERIC = /^(items?|list|all|details?|info|data|index|get|show|view|fetch|search|filter|my|mine|current|latest|recent|new|featured|popular|top|home|main|dashboard|overview|summary|count|stats?|statistics|by|for|of|create|add|update|edit|delete|remove|store|save)$/;
const AUTH = /^(login|log-in|signin|sign-in|sign_in|token|register|signup|sign-up|sign_up|otp|verify|verify-otp|verification|send-otp|resend-otp|logout|log-out|signout|sign-out|refresh|refresh-token|forgot-password|reset-password|password|auth|session)$/;
const COMPOSITE = /^(home|dashboard|main|overview|index|landing|summary)$/;

export function singular(word: string): string {
  const w = word.toLowerCase();
  if (/ies$/.test(w)) return w.replace(/ies$/, 'y');
  if (/(sses|xes|ches|shes)$/.test(w)) return w.replace(/es$/, '');
  if (/[^s]s$/.test(w)) return w.slice(0, -1);
  return w;
}

/** `order-items` / `orderItems` / `order_items` → ['order', 'item']. */
export function tokens(text: string): string[] {
  return text
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[^a-z0-9؀-ۿ]+/)
    .filter(Boolean)
    .map(singular);
}

export function kindOf(word: string): EntityKind {
  const w = singular(word);
  const hit = KINDS.find((k) => k.words.test(w) || k.words.test(word.toLowerCase()));
  if (hit) return hit.kind;
  // compound names: `product_reviews` → last known word wins
  const parts = tokens(word);
  for (let i = parts.length - 1; i >= 0; i--) {
    const k = KINDS.find((d) => d.words.test(parts[i]));
    if (k) return k.kind;
  }
  return 'other';
}

/* --------------------------------- response data --------------------------------- */

const LIST_KEYS = /^(data|items|results|records|rows|list|docs|content|payload|products|orders|courses)$/i;
const SKIP_KEYS = /^(meta|metadata|pagination|links|errors|headers|paging|page_info)$/i;

/** Arrays of objects found in a response body, with their path; best candidates first. */
export function findLists(body: unknown, path: string[] = [], depth = 0, out: { path: string[]; rows: Record<string, unknown>[] }[] = []) {
  if (Array.isArray(body)) {
    const rows = body.filter(isObj);
    if (rows.length) out.push({ path, rows });
    return out;
  }
  if (!isObj(body) || depth > 3) return out;
  for (const [key, value] of Object.entries(body).slice(0, 40)) {
    if (SKIP_KEYS.test(key)) continue;
    findLists(value, [...path, key], depth + 1, out);
  }
  return out.sort((a, b) => Number(LIST_KEYS.test(b.path[b.path.length - 1] || '')) - Number(LIST_KEYS.test(a.path[a.path.length - 1] || '')));
}

/** `{data:{…}}`, `{user:{…}}` → the record object and its path. */
export function findRecord(body: unknown): { path: string[]; record: Record<string, unknown> } | null {
  if (!isObj(body)) return null;
  const wrapped = Object.entries(body).find(([key, value]) => isObj(value) && /^(data|result|item|payload|record|user|profile|account|me)$/i.test(key));
  if (wrapped) {
    const inner = findRecord(wrapped[1]);
    if (inner && inner.path.length && Object.keys(wrapped[1] as object).length <= 3) return { path: [wrapped[0], ...inner.path], record: inner.record };
    return { path: [wrapped[0]], record: wrapped[1] as Record<string, unknown> };
  }
  return { path: [], record: body };
}

const ROLE_PATTERNS: [keyof FieldRoles, RegExp][] = [
  ['id', /^(id|_id|uuid|code|order_?number|order_?no|reference|ref)$/i],
  ['title', /^(name|title|full_?name|display_?name|product_?name|course_?name|item_?name|label|subject|headline|username|order_?number|caption)$/i],
  ['image', /^(image|image_?url|img|thumbnail|thumb|photo|picture|avatar|avatar_?url|logo|cover|cover_?image|banner|icon|images|media|main_?image|profile_?image)$/i],
  ['price', /^(price|unit_?price|sale_?price|final_?price|amount|total|total_?price|total_?amount|cost|fee|fare|grand_?total|subtotal)$/i],
  ['oldPrice', /^(old_?price|original_?price|compare_?at_?price|price_?before|regular_?price|list_?price)$/i],
  ['currency', /^(currency|currency_?code)$/i],
  ['rating', /^(rating|rate|stars|avg_?rating|average_?rating|review_?score)$/i],
  ['status', /^(status|state|order_?status|stage|delivery_?status)$/i],
  ['date', /^(created_?at|date|time|start_?at|starts_?at|start_?date|scheduled_?at|delivery_?date|due_?date|timestamp|published_?at|updated_?at)$/i],
  ['quantity', /^(quantity|qty|count|items_?count|stock)$/i],
  ['progress', /^(progress|percent|percentage|completion|completed_?percentage|progress_?percent)$/i],
  ['badge', /^(category|category_?name|tag|type|level|brand|kind|section)$/i],
  ['description', /^(description|details|body|content|summary|bio|about|notes|short_?description|text)$/i],
  ['person', /^(customer_?name|driver_?name|teacher|teacher_?name|instructor|author|author_?name|owner|seller|customer|driver|client_?name)$/i],
  ['address', /^(address|location|pickup_?address|dropoff_?address|delivery_?address|area|city|destination)$/i],
  ['lat', /^(lat|latitude|pickup_?lat)$/i],
  ['lng', /^(lng|lon|long|longitude|pickup_?lng)$/i],
  ['phone', /^(phone|mobile|phone_?number|tel)$/i],
  ['email', /^(email|e_?mail)$/i],
];

const SUBTITLE = /^(category|category_?name|brand|subtitle|short_?description|role|type|teacher_?name|instructor|email|address|city|area|customer_?name)$/i;

const scalarish = (value: unknown) => typeof value === 'string' || typeof value === 'number' || isLocalized(value);
/** `{en:'…', ar:'…'}` translated text counts as text. */
const isLocalized = (value: unknown) => isObj(value) && Object.keys(value).length > 0 && Object.keys(value).every((k) => /^[a-z]{2}(-[A-Z]{2})?$/.test(k));

/** Picks which field of a sample item plays which visual role. Nested one level: `customer.name`, `images[0]` → `images`. */
export function fieldRoles(sample: Record<string, unknown> | undefined): FieldRoles {
  const roles: FieldRoles = {};
  if (!sample) return roles;
  const entries: [string, unknown][] = [];
  for (const [key, value] of Object.entries(sample)) {
    entries.push([key, value]);
    if (isObj(value) && !isLocalized(value)) for (const [inner, v] of Object.entries(value).slice(0, 15)) entries.push([`${key}.${inner}`, v]);
  }
  const leaf = (path: string) => path.split('.').pop() || path;
  for (const [role, pattern] of ROLE_PATTERNS) {
    const candidates = entries.filter(([path, value]) => pattern.test(leaf(path)) && value !== null && value !== undefined);
    const fit = candidates.find(([path, value]) => {
      if (role === 'image') return typeof value === 'string' || (Array.isArray(value) && value.length > 0) || (isObj(value) && typeof (value as any).url === 'string');
      if (role === 'price' || role === 'oldPrice' || role === 'rating' || role === 'progress' || role === 'quantity' || role === 'lat' || role === 'lng')
        return typeof value === 'number' || (typeof value === 'string' && /^-?\d+(\.\d+)?$/.test(value.trim()));
      if (role === 'person' && isObj(value)) return false;
      if (role === 'id') return !path.includes('.') && (typeof value === 'string' || typeof value === 'number');
      return scalarish(value) && !path.includes('.') ? true : scalarish(value) && /name$/i.test(leaf(path));
    });
    if (fit) roles[role] = fit[0];
  }
  // nested person objects: `customer: { name }`
  if (!roles.person) {
    const nested = entries.find(([path, value]) => path.includes('.') && /^(customer|driver|teacher|instructor|author|user|owner|seller)\.(name|full_?name)$/i.test(path) && typeof value === 'string');
    if (nested) roles.person = nested[0];
  }
  if (!roles.title) {
    const firstText = entries.find(([path, value]) => !path.includes('.') && typeof value === 'string' && value.length > 1 && value.length < 80 && !/^(id|_id|uuid|status|image|url|created_?at|updated_?at)$/i.test(path) && !/^https?:\/\//.test(value));
    if (firstText) roles.title = firstText[0];
  }
  if (!roles.subtitle) {
    const sub = entries.find(([path, value]) => !path.includes('.') && SUBTITLE.test(path) && scalarish(value) && path !== roles.title);
    if (sub) roles.subtitle = sub[0];
  }
  if (roles.title && roles.title === roles.id && entries.some(([p]) => /^(name|title)$/i.test(p))) roles.title = entries.find(([p]) => /^(name|title)$/i.test(p))![0];
  return roles;
}

/* ---------------------------------- endpoints ---------------------------------- */

export interface Classified {
  endpoint: Endpoint;
  /** Entity id, e.g. `orders` or `products`; null for auth/composite endpoints. */
  entity: string | null;
  kind: EntityKind;
  intent: Intent;
  verb?: string;
  /** Words used to decide (for the evidence trail). */
  words: string[];
}

/** Literal leading segments shared by every endpoint (`/mobile/delivery/…`), which name the app, not resources. */
export function commonPrefix(endpoints: Endpoint[]): string[] {
  if (endpoints.length < 2) return [];
  const literal = endpoints.map((e) => e.segments);
  const prefix: string[] = [];
  for (let i = 0; ; i++) {
    const seg = literal[0][i];
    if (!seg || isParam(seg) || !literal.every((s) => s[i] === seg && s.length > i + 1)) break;
    prefix.push(seg);
  }
  return prefix;
}

function exampleBody(endpoint: Endpoint) {
  return endpoint.examples.find((example) => example.code >= 200 && example.code < 300 && example.body !== undefined)?.body;
}

export function classifyEndpoint(endpoint: Endpoint, prefix: string[]): Classified {
  const segments = endpoint.segments.slice(prefix.length);
  const literals = segments.filter((s) => !isParam(s));
  const last = segments[segments.length - 1] || '';
  const lastLiteral = literals[literals.length - 1] || '';
  const nameWords = tokens(endpoint.name);
  const words = [...literals.flatMap(tokens), ...nameWords];
  const method = endpoint.method;
  const hasBodyPassword = [...endpoint.body.fields.map((f) => f.name), ...Object.keys(isObj(endpoint.body.example) ? endpoint.body.example : {})].some((n) => /pass(word|wd)?$/i.test(n));
  const authWord = literals.map((l) => l.toLowerCase()).find((l) => AUTH.test(l)) || nameWords.find((w) => AUTH.test(w));

  if (authWord || (method === 'POST' && hasBodyPassword)) {
    const w = authWord || '';
    const intent: Intent = /logout|log-out|signout|sign-out/.test(w)
      ? 'logout'
      : /register|signup|sign-up|sign_up/.test(w)
        ? 'register'
        : /otp|verify|verification/.test(w)
          ? 'otp'
          : /refresh|password|forgot|reset/.test(w)
            ? 'action'
            : 'login';
    if (intent !== 'action') return { endpoint, entity: null, kind: 'user', intent, words };
  }

  const body = exampleBody(endpoint);
  // verb at the end: POST /orders/{id}/accept
  const verbDef = VERBS.find((v) => v.words.test(lastLiteral.toLowerCase()));
  const verbIsTail = verbDef && last === lastLiteral && literals.length > 1;

  // resource = last literal that is a real noun (skip generic words and a trailing verb)
  const nouns = literals.filter((l, i) => !(verbIsTail && i === literals.length - 1) && !GENERIC.test(singular(l)) && !AUTH.test(l.toLowerCase()));
  let resource = nouns[nouns.length - 1];
  if (!resource && literals.length) {
    const nameNoun = nameWords.find((w) => kindOf(w) !== 'other');
    resource = nameNoun || literals.find((l) => !AUTH.test(l)) || literals[0];
  }

  if (method === 'GET' && literals.length && COMPOSITE.test(singular(literals[literals.length - 1])) && findLists(body).length >= 2) {
    return { endpoint, entity: null, kind: 'other', intent: 'composite', words };
  }

  const resourceWord = resource ? singular(resource) : 'item';
  let kind = kindOf(resourceWord);
  if (kind === 'other') {
    const fromName = nameWords.map((w) => kindOf(w)).find((k) => k !== 'other');
    if (fromName) kind = fromName;
  }
  const entity = kind === 'user' ? 'profile' : resourceWord.replace(/[^a-z0-9؀-ۿ]+/gi, '_');
  const endsWithParam = isParam(last);
  const hasList = findLists(body).length > 0;
  const searchQuery = endpoint.query.some((q) => /^(q|query|search|keyword|term|s)$/i.test(q.name));

  let intent: Intent;
  if (verbIsTail && method !== 'GET') intent = 'action';
  else if (method === 'GET') {
    if (kind === 'user' && !endsWithParam) intent = 'me';
    else if (searchQuery && !endsWithParam) intent = 'search';
    else if (endsWithParam && !hasList) intent = 'detail';
    else if (hasList || !body) intent = endsWithParam ? 'detail' : 'list';
    else intent = 'single';
  } else if (method === 'DELETE') intent = 'delete';
  else if (method === 'PUT' || method === 'PATCH') intent = kind === 'user' ? 'updateProfile' : 'update';
  else intent = kind === 'user' && !endsWithParam ? 'updateProfile' : 'create';

  return { endpoint, entity, kind, intent, verb: verbIsTail ? verbDef!.label : undefined, words };
}

export { exampleBody, isObj };
