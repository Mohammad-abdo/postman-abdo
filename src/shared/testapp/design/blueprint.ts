/**
 * Blueprint: the app's structure taken from the collection's own folders.
 *
 * A collection author already grouped the API into features ("Towing", "Spare Parts", "Insurance requests"…).
 * Those groups become the app's areas: one page each (so it is editable in the studio like any page), the biggest ones as tabs,
 * the rest as shortcuts on Home. The business type only supplies mood and wording; it no longer decides the structure.
 * Only applies when the collection has at least two such areas; flat collections keep the business-type layout.
 */
import type { ActionDef, ApiModel } from '../types';
import type { AppDesign, DesignEntity, DesignSection } from './design.types';
import { isLookup } from './lists';

export interface Area {
  id: string;
  name: string;
  icon: string;
  entities: string[];
  actions: string[];
  weight: number;
}
export type Archetype = 'hub' | 'catalog' | 'dashboard' | 'feed';

/** "00 Authentication (phone + OTP)" → "Authentication"; "Maintenance Packages — Customer Journey" → "Maintenance Packages". */
export const areaName = (raw: string) =>
  raw
    .replace(/^\s*(\d+|[A-Za-z])[.)]\s+/, '')
    .replace(/^[\d.\s_-]+/, '')
    .replace(/\s*[—–]\s.*$/, '')
    .replace(/\s+-\s.*$/, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim();

const ACCOUNT = /(auth|sign\s?(in|out|up)|log\s?(in|out)|regist|otp|account|session|password|verify)/i;
const SYSTEM = /^(banners?(\s+and\s+home)?|home|config(uration)?|settings?|public|health|lookups?|misc|utilities?)$/i;
const AUTH_PATH = /(auth|otp|login|logout|register|refresh|verify|password|sign-?(in|out|up))/i;
const ICONS: [RegExp, string][] = [
  [/tow|truck|recover/i, 'local_shipping'], [/insur|polic/i, 'verified_user'], [/vehicle|car\b|garage|auto/i, 'directions_car'],
  [/part|spare|product|shop|store|catalog|market/i, 'inventory_2'], [/maint|service|repair|workshop/i, 'build'], [/order|purchase|cart|checkout/i, 'receipt_long'],
  [/book|appoint|reserv|schedul/i, 'event'], [/chat|message|support|help/i, 'chat'], [/pay|wallet|invoice|bill|transaction/i, 'payments'],
  [/review|rating/i, 'star'], [/offer|coupon|promo|deal/i, 'local_offer'], [/news|article|blog|post/i, 'article'], [/user|profile|member|customer/i, 'person'],
  [/course|lesson|class|school/i, 'school'], [/food|menu|restaurant|meal/i, 'restaurant'], [/doctor|patient|clinic|health/i, 'medical_services'],
];
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9؀-ۿ]+/g, '-').replace(/^-|-$/g, '') || 'area';

const rootList = (e?: DesignEntity) => e?.ops.find((o) => (o.intent === 'list' || o.intent === 'search') && !o.pathParams.length);

/** Feature areas of the collection, biggest first. Sign-in, sign-out and public/config folders are not areas. */
export function buildAreas(model: ApiModel, entities: Record<string, DesignEntity>, actionOf: (key: string) => ActionDef | undefined): Area[] {
  const groups = new Map<string, ApiModel['endpoints']>();
  for (const e of model.endpoints) {
    const top = e.folderPath[0];
    if (!top) continue;
    groups.set(top, [...(groups.get(top) || []), e]);
  }
  const byAction = new Map<string, DesignEntity[]>();
  for (const ent of Object.values(entities)) for (const op of ent.ops) byAction.set(op.action, [...(byAction.get(op.action) || []), ent]);
  const merged = new Map<string, Area>();
  for (const [folder, eps] of groups) {
    const name = areaName(folder);
    if (!name || SYSTEM.test(name) || ACCOUNT.test(name)) continue;
    if (eps.filter((e) => AUTH_PATH.test(e.path)).length / eps.length > 0.7) continue;
    const actions = eps.map((e) => actionOf(e.key)?.id).filter((v): v is string => !!v);
    if (!actions.length) continue;
    const ents = [...new Set(actions.flatMap((a) => (byAction.get(a) || []).filter((e) => e.kind !== 'user' && !isLookup(e)).map((e) => e.id)))];
    const lists = ents.filter((id) => rootList(entities[id])).length;
    const key = slug(name);
    const prev = merged.get(key);
    if (prev) {
      prev.actions.push(...actions);
      prev.entities = [...new Set([...prev.entities, ...ents])];
      prev.weight += actions.length + lists * 3;
      continue;
    }
    merged.set(key, { id: `area-${key}`, name, icon: ICONS.find(([re]) => re.test(name))?.[1] || entities[ents[0]]?.icon || 'apps', entities: ents, actions, weight: actions.length + lists * 3 });
  }
  return [...merged.values()].filter((a) => a.entities.length || a.actions.length > 1).sort((a, b) => b.weight - a.weight).slice(0, 10);
}

/** Which way the collection leans decides how Home is arranged, so different APIs get different structures, not only different colours. */
export function archetypeOf(areas: Area[], entities: Record<string, DesignEntity>): Archetype {
  const lists = Object.values(entities).filter((e) => rootList(e) && e.kind !== 'user' && !isLookup(e));
  const visual = lists.filter((e) => e.roles.image || e.card === 'product').length;
  const tracked = lists.filter((e) => e.roles.status || e.roles.price).length;
  if (visual >= 3 && visual >= tracked) return 'catalog';
  if (tracked >= 3 && tracked > visual) return 'dashboard';
  if (areas.length >= 5) return 'hub';
  return lists.length > 4 ? 'feed' : 'hub';
}

/** One page per area: a section per list (grid, rail or list by what its items look like) and every other request as a button. */
export function areaPages(areas: Area[], entities: Record<string, DesignEntity>, actions: Record<string, ActionDef>, taken: Set<string>, slices: { label: string; entity?: string; values?: Record<string, string> }[] = []): NonNullable<AppDesign['pages']> {
  return areas.map((area) => {
    const sections: DesignSection[] = [];
    const used = new Set<string>();
    for (const id of area.entities) {
      const ent = entities[id];
      const op = rootList(ent);
      // a folder that is one slice of a shared list (type=MAINTENANCE_PACKAGE) shows only that slice, even if another area already lists the entity
      const slice = ent && slices.find((s) => s.label === area.name && s.entity === ent.id && s.values);
      if (!ent || !op || (taken.has(ent.id) && !slice) || ['cart', 'setting', 'notification'].includes(ent.kind) || sections.length >= 6) continue;
      taken.add(ent.id);
      used.add(op.action);
      const type = ent.roles.price || ent.card === 'product' ? 'grid' : ent.roles.image && ['venue', 'course', 'event', 'person'].includes(ent.card) ? 'rail' : ent.roles.image ? 'grid' : 'list';
      sections.push({ id: `${area.id}.${sections.length}`, type, title: slice ? area.name : ent.plural, values: slice?.values, entity: ent.id, action: op.action, dataPath: op.dataPath, roles: op.roles, card: ent.card, limit: type === 'list' ? 6 : 8, columns: type === 'grid' ? 2 : undefined });
    }
    // everything else in the folder stays one tap away: create forms, actions, single records
    const items = [...new Set(area.actions)]
      .filter((a) => !used.has(a) && actions[a])
      .slice(0, 16)
      .map((a) => ({ label: actions[a].label, icon: 'bolt', action: a }));
    if (items.length) sections.push({ id: `${area.id}.actions`, type: 'shortcuts', title: sections.length ? 'More in this area' : 'What you can do', items });
    return { id: area.id, title: area.name, icon: area.icon, sections };
  });
}

/** Home order by archetype: hub opens on the areas, dashboard on the numbers, catalog on the products, feed on content with areas after the first block. */
export function arrangeHome(sections: DesignSection[], archetype: Archetype): DesignSection[] {
  const top = new Set(['greeting', 'search', 'status']);
  const head = sections.filter((s) => top.has(s.type));
  const rest = sections.filter((s) => !top.has(s.type));
  const areasSection = rest.find((s) => s.type === 'shortcuts' && (s.items || []).some((i) => i.page));
  const insights = rest.find((s) => s.type === 'insights' || s.type === 'stats' || s.type === 'balance');
  const others = rest.filter((s) => s !== areasSection && s !== insights);
  const withTitle = (s?: DesignSection, title?: string) => (s ? { ...s, title: title ?? s.title } : undefined);
  const list =
    archetype === 'dashboard' ? [insights, withTitle(areasSection, 'Jump to'), ...others]
    : archetype === 'catalog' ? [...others, withTitle(areasSection, 'Browse by area'), insights]
    : archetype === 'feed' ? [others[0], withTitle(areasSection, 'Explore'), ...others.slice(1), insights]
    : [withTitle(areasSection, 'What do you need?'), insights, ...others];
  return [...head, ...(list.filter(Boolean) as DesignSection[])].map((s, i) => ({ ...s, id: `home.${i}` }));
}
