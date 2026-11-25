/* Collection ↔ mobile design report. Pure: explains every endpoint of the collection, where the generated (and customised) mobile app uses it,
   what the tests found, and what does not fit. Nothing here is guessed beyond what the model, schema and design already say. */

import type { DesignSection } from './design/design.types';
import type { AppDesign } from './design/design.types';
import type { ApiModel, AppSchema, Endpoint } from './types';
import type { TestResult } from './testing';

type Place = { kind: 'screen' | 'tab' | 'section' | 'button' | 'auth' | 'developer'; label: string };

export type EndpointStatus = 'in-app' | 'developer-menu' | 'background' | 'excluded' | 'unused';

export interface EndpointReport {
  key: string;
  name: string;
  method: string;
  path: string;
  folder: string;
  auth: string;
  role: string;
  resource: string | null;
  disposition: { state: string; reason?: string };
  status: EndpointStatus;
  explanation: string;
  places: Place[];
  examples: { code: number; name: string }[];
  inputs: string[];
  tests: { passed: number; failed: number; warnings: number; skipped: number; problems: { name: string; message: string }[] };
}

export interface ReportIssue {
  severity: 'error' | 'warn' | 'info';
  title: string;
  detail?: string;
  endpoint?: string;
}

export interface DesignReport {
  summary: {
    endpoints: number;
    inApp: number;
    developerMenu: number;
    background: number;
    excluded: number;
    unused: number;
    /** inApp ÷ everything that should appear in the app (excludes background and excluded). */
    compatibility: number;
    withExamples: number;
    tests: { run: boolean; passed: number; failed: number; warnings: number; skipped: number };
    domain: string;
    brand: string;
  };
  endpoints: EndpointReport[];
  issues: ReportIssue[];
}

const ROLE_TEXT: Record<string, (r: string) => string> = {
  list: (r) => `returns a list of ${r}`,
  get: (r) => `returns one ${r} by its id`,
  create: (r) => `creates a new ${r}`,
  update: (r) => `changes an existing ${r}`,
  delete: (r) => `removes a ${r}`,
  login: () => 'signs the user in and returns a session token',
  register: () => 'creates a new account',
  logout: () => 'signs the user out',
  me: () => 'returns the signed-in user profile',
  refresh: () => 'renews the session token in the background',
};

const articleOf = (s: string) => s.replace(/s$/, '');

/** One plain sentence about what the endpoint is, from its detected role. */
function explain(e: Endpoint, role: string, resource: string | null): string {
  const what = (ROLE_TEXT[role] || ((r: string) => `acts as “${role}” on ${r}`))(resource ? articleOf(resource).replace(/_/g, ' ') : 'data');
  const params = e.pathParams.length ? ` Needs ${e.pathParams.map((p) => `{${p.name}}`).join(', ')} in the path.` : '';
  const body = e.body.fields.length ? ` Sends ${e.body.fields.slice(0, 5).map((f) => f.name).join(', ')}${e.body.fields.length > 5 ? '…' : ''}.` : '';
  const auth = e.auth.type && e.auth.type !== 'noauth' ? ` Uses ${e.auth.type} auth${e.auth.inherited ? ' (inherited)' : ''}.` : '';
  return `${e.method} ${e.path} ${what}.${params}${body}${auth}`;
}

export function buildReport(input: {
  model: ApiModel;
  schema: AppSchema & { design?: AppDesign };
  customization?: { home?: DesignSection[]; pages?: { id: string; title: string; sections: DesignSection[] }[] } | null;
  results?: TestResult[] | null;
}): DesignReport {
  const { model, schema } = input;
  const design = schema.design as AppDesign;
  const custom = input.customization || null;
  const actionToEndpoint = new Map(Object.values(schema.actions).map((a) => [a.id, a.endpoint]));
  const places = new Map<string, Place[]>();
  const issues: ReportIssue[] = [];
  const add = (endpoint: string | undefined, place: Place) => {
    if (!endpoint) return;
    const list = places.get(endpoint) || [];
    if (!list.some((p) => p.kind === place.kind && p.label === place.label)) list.push(place);
    places.set(endpoint, list);
  };
  const viaAction = (action: string | undefined, place: Place, where: string) => {
    if (!action) return;
    const endpoint = actionToEndpoint.get(action);
    if (!endpoint) issues.push({ severity: 'error', title: `${where} uses an action that does not exist in the collection`, detail: `Action “${action}” has no endpoint. The button or list would be empty.` });
    else add(endpoint, place);
  };

  // sign-in and profile
  for (const [k, label] of [['login', 'Sign in'], ['register', 'Create account'], ['otp', 'Verify code'], ['logout', 'Sign out'], ['me', 'Profile'], ['updateProfile', 'Edit profile']] as const) viaAction((design.auth as Record<string, any>)[k], { kind: 'auth', label }, `The ${label.toLowerCase()} screen`);
  if (design.auth.required && !design.auth.login) issues.push({ severity: 'warn', title: 'The app asks users to sign in, but no login endpoint was found', detail: 'Mark one request as the login (Mapping tab) so the app can sign in.' });

  // entities: lists, details, buttons, tabs
  const tabOf = new Map(design.tabs.map((t) => [t.screen, t.label]));
  for (const ent of Object.values(design.entities)) {
    const tab = tabOf.get(`browse.${ent.id}`);
    if (!ent.roles?.title) issues.push({ severity: 'info', title: `“${ent.label}” has no field to use as a title`, detail: 'Cards show a generic title. Check the example response has a name or title field.' });
    for (const op of ent.ops) {
      const where = op.intent === 'list' ? (tab ? `${tab} tab (list)` : `${ent.plural} list`) : op.intent === 'detail' ? `${ent.label} detail screen` : `${ent.label}: ${op.label}`;
      add(op.endpoint, { kind: op.intent === 'list' || op.intent === 'detail' ? 'screen' : 'button', label: where });
    }
    for (const cta of ent.ctas) viaAction(cta.action, { kind: 'button', label: `${ent.label} detail → “${cta.label}”` }, `“${cta.label}” on ${ent.label}`);
    for (const rel of ent.relations || []) viaAction((rel as { action?: string }).action, { kind: 'button', label: `${ent.label} detail → ${(rel as { label?: string }).label || 'related action'}` }, `A related button on ${ent.label}`);
  }
  for (const t of design.tabs) if (t.badge?.action) viaAction(t.badge.action, { kind: 'tab', label: `${t.label} tab badge` }, `The ${t.label} tab badge`);

  // sections on Home and on pages (the customised version when there is one)
  const screens: [string, DesignSection[]][] = [
    ['Home', custom?.home ?? design.screens.home?.sections ?? []],
    ...((custom?.pages ?? design.pages ?? []).map((p) => [p.title, p.sections] as [string, DesignSection[]])),
  ];
  for (const [name, sections] of screens) {
    for (const s of sections) {
      if (s.hidden) continue;
      const label = `${name} → ${s.title || s.type}`;
      viaAction(s.action, { kind: 'section', label }, `“${s.title || s.type}” on ${name}`);
      viaAction(s.target?.action, { kind: 'button', label: `${name} → button “${s.title || s.type}”` }, `The button on ${name}`);
      if (s.entity) {
        const ent = design.entities[s.entity];
        if (!ent) issues.push({ severity: 'error', title: `“${s.title || s.type}” on ${name} points at “${s.entity}”, which is not in this collection` });
        else for (const op of ent.ops.filter((o) => o.intent === 'list')) add(op.endpoint, { kind: 'section', label });
      }
    }
    if (!sections.length) issues.push({ severity: 'warn', title: `“${name}” has no sections`, detail: 'The screen will be empty.' });
  }
  for (const action of design.looseActions || []) add(actionToEndpoint.get(action), { kind: 'developer', label: 'Developer menu (no screen fits it)' });

  // test results per endpoint
  const byEndpoint = new Map<string, TestResult[]>();
  for (const r of input.results || []) if (r.endpoint) byEndpoint.set(r.endpoint, [...(byEndpoint.get(r.endpoint) || []), r]);

  const endpoints: EndpointReport[] = model.endpoints.map((e) => {
    const role = schema.endpoints[e.key]?.role || 'unknown';
    const resource = schema.endpoints[e.key]?.resource ?? null;
    const disposition = schema.dispositions[e.key] || { state: 'explorer' };
    const list = places.get(e.key) || [];
    const inApp = list.some((p) => p.kind !== 'developer');
    const status: EndpointStatus = disposition.state === 'excluded' ? 'excluded' : disposition.state === 'background' ? 'background' : inApp ? 'in-app' : disposition.state === 'explorer' || list.length ? 'developer-menu' : 'unused';
    const res = byEndpoint.get(e.key) || [];
    const problems = res.filter((r) => r.status === 'failed' || r.status === 'warning').slice(0, 5).map((r) => ({ name: r.name, message: r.error || `${r.expected} → ${r.actual}` }));
    const row: EndpointReport = {
      key: e.key,
      name: e.name,
      method: e.method,
      path: e.path,
      folder: e.folderPath.join(' / '),
      auth: e.auth.type,
      role,
      resource,
      disposition: { state: disposition.state, reason: disposition.reason },
      status,
      explanation: explain(e, role, resource),
      places: list,
      examples: e.examples.map((x) => ({ code: x.code, name: x.name })),
      inputs: [...e.pathParams.map((p) => `path:${p.name}`), ...e.query.map((q) => `query:${q.name}`), ...e.body.fields.map((f) => `body:${f.name}`)],
      tests: { passed: res.filter((r) => r.status === 'passed').length, failed: res.filter((r) => r.status === 'failed').length, warnings: res.filter((r) => r.status === 'warning').length, skipped: res.filter((r) => r.status === 'skipped').length, problems },
    };
    if (status === 'unused') issues.push({ severity: 'warn', title: `${e.method} ${e.path} is in the collection but nothing in the app uses it`, detail: 'Add a section or button that calls it in the Design Studio, or exclude it in the Mapping tab.', endpoint: e.key });
    if (!e.examples.length && status === 'in-app') issues.push({ severity: 'info', title: `${e.method} ${e.path} has no saved example response`, detail: 'The mock app invents sample data for it. Save an example in Postman to make the preview match your real API.', endpoint: e.key });
    if (row.tests.failed) issues.push({ severity: 'error', title: `${e.method} ${e.path} failed ${row.tests.failed} test${row.tests.failed === 1 ? '' : 's'}`, detail: problems[0]?.message, endpoint: e.key });
    if (disposition.state === 'excluded') issues.push({ severity: 'info', title: `${e.method} ${e.path} is left out of the app`, detail: disposition.reason, endpoint: e.key });
    return row;
  });

  const count = (s: EndpointStatus) => endpoints.filter((e) => e.status === s).length;
  const shouldAppear = endpoints.length - count('background') - count('excluded');
  const t = (k: 'passed' | 'failed' | 'warnings' | 'skipped') => endpoints.reduce((n, e) => n + e.tests[k], 0);
  const order = { error: 0, warn: 1, info: 2 };
  return {
    summary: {
      endpoints: endpoints.length,
      inApp: count('in-app'),
      developerMenu: count('developer-menu'),
      background: count('background'),
      excluded: count('excluded'),
      unused: count('unused'),
      compatibility: shouldAppear ? Math.round((count('in-app') / shouldAppear) * 100) : 100,
      withExamples: endpoints.filter((e) => e.examples.length).length,
      tests: { run: Boolean(input.results?.length), passed: t('passed'), failed: t('failed'), warnings: t('warnings'), skipped: t('skipped') },
      domain: design.domain.label,
      brand: design.brand.name,
    },
    endpoints,
    issues: issues.sort((a, b) => order[a.severity] - order[b.severity]).slice(0, 200),
  };
}
