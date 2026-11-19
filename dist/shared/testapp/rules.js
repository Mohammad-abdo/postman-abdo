"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ruleSetVersion = exports.BUILTIN_RULES = void 0;
exports.resolve = resolve;
exports.evaluateRules = evaluateRules;
const relations_1 = require("./relations");
const ui_helpers_1 = require("./ui-helpers");
const util_1 = require("./util");
const LAYER_RANK = { user: 0, collection: 1, project: 2, builtin: 3, ai: 4 };
const mk = (rule) => (slot, value) => ({ slot, value, ruleId: rule.id, layer: 'builtin', priority: rule.priority, provenance: 'inferred' });
const disp = (key) => `disp:${key}`;
const listScreen = (r) => `scr.${r}.list`;
const detailScreen = (r) => `scr.${r}.detail`;
function ensureDetail(P, r, ctx, out) {
    const get = ctx.eps(r.id, 'get')[0];
    const id = detailScreen(r.id);
    if (out.some((p) => p.slot === `screen:${id}`))
        return id;
    const screen = { id, title: `${(0, ui_helpers_1.singularTitle)(r.id)} details`, kind: get ? 'detail' : 'page', resource: r.id, sources: get ? [get.key] : [], components: [], ruleId: '', provenance: 'inferred' };
    out.push(P(`screen:${id}`, screen));
    if (get) {
        const sample = (0, ui_helpers_1.findList)((0, ui_helpers_1.successExample)(get)?.body)?.sample;
        out.push(P(`action:act.${r.id}.get`, action(`act.${r.id}.get`, `Load ${(0, ui_helpers_1.singularTitle)(r.id)}`, get, 'get', (0, ui_helpers_1.queryFields)(get).concat((0, ui_helpers_1.formFields)(get, { withPath: true }).filter((f) => f.in === 'path')))));
        out.push(P(`component:${id}:c.detail`, { id: 'c.detail', type: 'detail', action: `act.${r.id}.get`, dataPath: '$', order: 10, hasSample: !!sample }));
    }
    else {
        out.push(P(`component:${id}:c.id`, { id: 'c.id', type: 'idPrompt', label: `${(0, ui_helpers_1.singularTitle)(r.id)} id`, order: 5 }));
    }
    return id;
}
function action(id, label, e, kind, inputs, extra = {}) {
    return { id, label, endpoint: e.key, kind, inputs, ruleId: '', provenance: 'inferred', ...extra };
}
const top = (ctx) => ctx.resources.filter((r) => !r.parent && r.endpoints.length > 0);
/* ------------------------------------------------------------------ */
/* Built-in rules                                                      */
/* ------------------------------------------------------------------ */
const rules = [
    {
        id: 'R-EXT-001', name: 'Third-party hosts are excluded', description: 'Endpoints on a host other than the collection\'s main host are not part of the product and are excluded (reason recorded).',
        layer: 'builtin', priority: 200, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            return ctx.model.endpoints.filter((e) => e.flags.external).map((e) => P(disp(e.key), { state: 'excluded', reason: `External host ${e.host}` }));
        },
    },
    {
        id: 'R-BG-001', name: 'Health/metrics/webhook endpoints are background', description: 'Operational endpoints are not screens. They count as "background" in coverage.',
        layer: 'builtin', priority: 190, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            return ctx.model.endpoints.filter((e) => !e.flags.external && relations_1.BACKGROUND.test(e.segments[e.segments.length - 1] || '')).map((e) => P(disp(e.key), { state: 'background', reason: 'operational endpoint' }));
        },
    },
    {
        id: 'R-AUTH-001', name: 'Login endpoint → login screen', description: 'A login endpoint becomes the login screen; its token response is captured by the session.',
        layer: 'builtin', priority: 150, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const e = ctx.graph.authLogin ? ctx.ep(ctx.graph.authLogin) : null;
            if (!e || e.flags.external)
                return [];
            const out = [];
            out.push(P(disp(e.key), { state: 'mapped' }));
            out.push(P('screen:scr.auth.login', { id: 'scr.auth.login', title: 'Login', kind: 'login', sources: [e.key], components: [], requiresAuth: false, ruleId: '', provenance: 'inferred' }));
            out.push(P('action:act.auth.login', action('act.auth.login', 'Log in', e, 'login', (0, ui_helpers_1.formFields)(e, { withPath: true }))));
            out.push(P('component:scr.auth.login:c.form', { id: 'c.form', type: 'form', action: 'act.auth.login', submitLabel: 'Log in', order: 10 }));
            return out;
        },
    },
    {
        id: 'R-AUTH-002', name: 'Profile → screen, logout → header action', description: 'Session endpoints (profile/me) become a profile screen; logout becomes a header action.',
        layer: 'builtin', priority: 145, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const e of ctx.model.endpoints) {
                const role = ctx.graph.roles[e.key].role;
                if (e.flags.external)
                    continue;
                if (role === 'auth.session') {
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    out.push(P('screen:scr.auth.profile', { id: 'scr.auth.profile', title: 'Profile', kind: 'profile', sources: [e.key], components: [], ruleId: '', provenance: 'inferred' }));
                    out.push(P('action:act.auth.session', action('act.auth.session', 'Load profile', e, 'get', [])));
                    out.push(P('component:scr.auth.profile:c.detail', { id: 'c.detail', type: 'detail', action: 'act.auth.session', dataPath: '$', order: 10 }));
                    out.push(P('nav:nav.profile', { id: 'nav.profile', label: 'Profile', screen: 'scr.auth.profile', requiresAuth: true, order: 900 }));
                }
                if (role === 'auth.logout') {
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    out.push(P('action:act.auth.logout', action('act.auth.logout', 'Log out', e, 'logout', [])));
                    out.push(P('nav:nav.logout', { id: 'nav.logout', label: 'Log out', screen: '', action: 'act.auth.logout', requiresAuth: true, order: 999 }));
                }
            }
            return out;
        },
    },
    {
        id: 'R-CRUD-001', name: 'List/get endpoints → list and detail screens', description: 'GET collection → list screen (table); GET item → detail screen. One module per resource, not one screen per endpoint.',
        layer: 'builtin', priority: 100, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const list = ctx.eps(r.id, 'list')[0];
                const get = ctx.eps(r.id, 'get')[0];
                const T = (0, util_1.titleCase)(r.name);
                if (list) {
                    out.push(P(disp(list.key), { state: 'mapped' }));
                    out.push(P(`screen:${listScreen(r.id)}`, { id: listScreen(r.id), title: T, kind: 'list', resource: r.id, sources: [list.key], components: [], ruleId: '', provenance: 'inferred' }));
                    out.push(P(`action:act.${r.id}.list`, action(`act.${r.id}.list`, `List ${T}`, list, 'list', (0, ui_helpers_1.queryFields)(list))));
                    out.push(P(`component:${listScreen(r.id)}:c.table`, { id: 'c.table', type: 'table', action: `act.${r.id}.list`, order: 10 }));
                    out.push(P(`nav:nav.${r.id}`, { id: `nav.${r.id}`, label: T, screen: listScreen(r.id), requiresAuth: list.auth.type !== 'noauth', order: 100 }));
                }
                if (get) {
                    out.push(P(disp(get.key), { state: 'mapped' }));
                    ensureDetail(P, r, ctx, out);
                    if (!list)
                        out.push(P(`nav:nav.${r.id}`, { id: `nav.${r.id}`, label: T, screen: detailScreen(r.id), requiresAuth: get.auth.type !== 'noauth', order: 100 }));
                }
            }
            return out;
        },
    },
    {
        id: 'R-LIST-001', name: 'Array response → table', description: 'Columns come from the scalar fields of the first record in the saved example (id, name, title, email, status first). Without an example the table falls back to a JSON viewer.',
        layer: 'builtin', priority: 90, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const list = ctx.eps(r.id, 'list')[0];
                if (!list)
                    continue;
                const shape = (0, ui_helpers_1.findList)((0, ui_helpers_1.successExample)(list)?.body);
                out.push(P(`table:${listScreen(r.id)}:columns`, { columns: (0, ui_helpers_1.columnsFor)(shape?.sample), dataPath: shape?.path || '$', idField: (0, ui_helpers_1.idFieldOf)(shape?.sample), known: !!shape?.sample }));
            }
            return out;
        },
    },
    {
        id: 'R-LIST-002', name: 'Pagination parameters → pager', description: 'page/limit, offset/limit or cursor query parameters produce a pager; the total is read from the example when present.',
        layer: 'builtin', priority: 85, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const list = ctx.eps(r.id, 'list')[0];
                const pg = list && (0, ui_helpers_1.paging)(list);
                if (!list || !pg)
                    continue;
                out.push(P(`table:${listScreen(r.id)}:pagination`, { ...pg, totalPath: (0, ui_helpers_1.findList)((0, ui_helpers_1.successExample)(list)?.body)?.totalPath }));
            }
            return out;
        },
    },
    {
        id: 'R-LIST-003', name: 'Search/filter/sort parameters → toolbar', description: 'q/search, sort/order and other query parameters become toolbar controls.',
        layer: 'builtin', priority: 80, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const list = ctx.eps(r.id, 'list')[0];
                if (!list)
                    continue;
                const search = (0, ui_helpers_1.searchParam)(list);
                const sort = (0, ui_helpers_1.sortParams)(list);
                const filters = (0, ui_helpers_1.filterParams)(list);
                if (search || sort.length || filters.length)
                    out.push(P(`table:${listScreen(r.id)}:toolbar`, { search, sort, filters }));
            }
            return out;
        },
    },
    {
        id: 'R-CRUD-002', name: 'POST on a resource → create form', description: 'A create endpoint becomes a form (modal when a list screen exists). Inputs come from the request body example.',
        layer: 'builtin', priority: 95, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const e = ctx.eps(r.id, 'create')[0];
                if (!e)
                    continue;
                const hasList = ctx.has(r.id, 'list');
                const sid = `scr.${r.id}.create`;
                const S = (0, ui_helpers_1.singularTitle)(r.id);
                out.push(P(disp(e.key), { state: 'mapped' }));
                out.push(P(`screen:${sid}`, { id: sid, title: `New ${S}`, kind: hasList ? 'modal' : 'page', resource: r.id, sources: [e.key], components: [], ruleId: '', provenance: 'inferred' }));
                out.push(P(`action:act.${r.id}.create`, action(`act.${r.id}.create`, `Create ${S}`, e, 'create', (0, ui_helpers_1.formFields)(e, { withPath: true }))));
                out.push(P(`component:${sid}:c.form`, { id: 'c.form', type: 'form', action: `act.${r.id}.create`, submitLabel: `Create ${S}`, order: 10 }));
                if (hasList)
                    out.push(P(`component:${listScreen(r.id)}:c.new`, { id: 'c.new', type: 'button', label: `New ${S}`, opens: sid, order: 5 }));
                else
                    out.push(P(`nav:nav.${r.id}.create`, { id: `nav.${r.id}.create`, label: `New ${S}`, screen: sid, requiresAuth: e.auth.type !== 'noauth', order: 110 }));
            }
            return out;
        },
    },
    {
        id: 'R-CRUD-003', name: 'PUT/PATCH on an item → edit form', description: 'An update endpoint becomes an edit form on the detail screen, prefilled from the GET endpoint.',
        layer: 'builtin', priority: 90, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                for (const role of ['update', 'patch']) {
                    const e = ctx.eps(r.id, role)[0];
                    if (!e)
                        continue;
                    const sid = ensureDetail(P, r, ctx, out);
                    const S = (0, ui_helpers_1.singularTitle)(r.id);
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    out.push(P(`action:act.${r.id}.${role}`, action(`act.${r.id}.${role}`, `Save ${S}`, e, role, (0, ui_helpers_1.formFields)(e, { withPath: true }))));
                    out.push(P(`component:${sid}:c.edit.${role}`, { id: `c.edit.${role}`, type: 'form', title: role === 'patch' ? 'Edit (partial)' : 'Edit', action: `act.${r.id}.${role}`, prefillFrom: ctx.has(r.id, 'get') ? `act.${r.id}.get` : undefined, submitLabel: 'Save', order: 30 }));
                }
            }
            return out;
        },
    },
    {
        id: 'R-CRUD-004', name: 'DELETE on an item → confirmed action', description: 'A delete endpoint becomes a destructive action with a confirmation dialog.',
        layer: 'builtin', priority: 85, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                const e = ctx.eps(r.id, 'delete')[0];
                if (!e)
                    continue;
                const sid = ensureDetail(P, r, ctx, out);
                const S = (0, ui_helpers_1.singularTitle)(r.id);
                out.push(P(disp(e.key), { state: 'mapped' }));
                out.push(P(`action:act.${r.id}.delete`, action(`act.${r.id}.delete`, `Delete ${S}`, e, 'delete', (0, ui_helpers_1.formFields)(e, { withPath: true }).filter((f) => f.in === 'path'), { confirm: `Delete this ${S.toLowerCase()}?` })));
                out.push(P(`component:${sid}:c.delete`, { id: 'c.delete', type: 'button', label: `Delete ${S}`, action: `act.${r.id}.delete`, destructive: true, order: 40 }));
            }
            return out;
        },
    },
    {
        id: 'R-CHILD-001', name: 'Nested resource → section inside the parent', description: '/parents/{id}/children becomes a section (table + add action) on the parent detail screen.',
        layer: 'builtin', priority: 80, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of ctx.resources.filter((x) => x.parent && !x.parent.includes('.') && x.endpoints.length)) {
                const parent = ctx.resources.find((x) => x.id === r.parent);
                if (!parent)
                    continue;
                const sid = ensureDetail(P, parent, ctx, out);
                const T = (0, util_1.titleCase)(r.name);
                const S = (0, ui_helpers_1.singularTitle)(r.id);
                const list = ctx.eps(r.id, 'nested-list')[0];
                const create = ctx.eps(r.id, 'nested-create')[0];
                const get = ctx.eps(r.id, 'nested-get')[0];
                const update = ctx.eps(r.id, 'nested-update')[0];
                const del = ctx.eps(r.id, 'nested-delete')[0];
                const sec = `c.sec.${r.name}`;
                out.push(P(`component:${sid}:${sec}`, { id: sec, type: 'section', title: T, order: 50 }));
                for (const [role, e] of [['list', list], ['get', get], ['update', update], ['delete', del], ['create', create]]) {
                    if (!e)
                        continue;
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    const inputs = (role === 'create' || role === 'update' ? (0, ui_helpers_1.formFields)(e, { withPath: true }) : [...(0, ui_helpers_1.queryFields)(e), ...(0, ui_helpers_1.formFields)(e, { withPath: true }).filter((f) => f.in === 'path')]);
                    out.push(P(`action:act.${r.id}.${role}`, action(`act.${r.id}.${role}`, `${role === 'list' ? 'List' : (0, util_1.titleCase)(role)} ${role === 'list' ? T : S}`, e, role, inputs, role === 'delete' ? { confirm: `Delete this ${S.toLowerCase()}?` } : {})));
                }
                if (list) {
                    const shape = (0, ui_helpers_1.findList)((0, ui_helpers_1.successExample)(list)?.body);
                    out.push(P(`component:${sid}:${sec}.table`, { id: `${sec}.table`, type: 'table', action: `act.${r.id}.list`, parent: sec, columns: (0, ui_helpers_1.columnsFor)(shape?.sample), dataPath: shape?.path || '$', idField: (0, ui_helpers_1.idFieldOf)(shape?.sample), passFromDetail: true, rowActions: [get && { label: 'View', action: `act.${r.id}.get` }, update && { label: 'Edit', action: `act.${r.id}.update`, form: true }, del && { label: 'Delete', action: `act.${r.id}.delete`, destructive: true }].filter(Boolean), order: 51 }));
                }
                if (create) {
                    const cs = `scr.${r.id}.create`;
                    out.push(P(`screen:${cs}`, { id: cs, title: `Add ${S}`, kind: 'modal', resource: r.id, sources: [create.key], components: [], ruleId: '', provenance: 'inferred' }));
                    out.push(P(`component:${cs}:c.form`, { id: 'c.form', type: 'form', action: `act.${r.id}.create`, passFromDetail: true, submitLabel: `Add ${S}`, order: 10 }));
                    out.push(P(`component:${sid}:${sec}.add`, { id: `${sec}.add`, type: 'button', label: `Add ${S}`, opens: cs, parent: sec, order: 52 }));
                }
            }
            return out;
        },
    },
    {
        id: 'R-ACTION-001', name: 'Verb endpoints → action buttons', description: 'POST /things/{id}/cancel (approve, activate, …) becomes a button on the detail screen. A 202 example marks it as asynchronous.',
        layer: 'builtin', priority: 70, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            for (const r of top(ctx)) {
                for (const e of ctx.eps(r.id, 'action')) {
                    const verb = ctx.graph.roles[e.key].verb || 'run';
                    const sid = ensureDetail(P, r, ctx, out);
                    const async = e.examples.some((x) => x.code === 202);
                    const id = `act.${r.id}.${verb}`;
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    out.push(P(`action:${id}`, action(id, (0, util_1.titleCase)(verb), e, async ? 'async' : 'action', [...(0, ui_helpers_1.queryFields)(e), ...(0, ui_helpers_1.formFields)(e, { withPath: true })], { confirm: /^(cancel|reject|archive|refund|close|deactivate)$/i.test(verb) ? `${(0, util_1.titleCase)(verb)} this ${(0, ui_helpers_1.singularTitle)(r.id).toLowerCase()}?` : undefined })));
                    out.push(P(`component:${sid}:c.act.${verb}`, { id: `c.act.${verb}`, type: 'button', label: (0, util_1.titleCase)(verb), action: id, order: 45 }));
                }
                for (const e of ctx.eps(r.id, 'search')) {
                    out.push(P(disp(e.key), { state: 'mapped' }));
                    out.push(P(`action:act.${r.id}.search`, action(`act.${r.id}.search`, `Search ${(0, util_1.titleCase)(r.name)}`, e, 'list', (0, ui_helpers_1.queryFields)(e))));
                    if (ctx.has(r.id, 'list'))
                        out.push(P(`table:${listScreen(r.id)}:searchAction`, { action: `act.${r.id}.search` }));
                }
            }
            return out;
        },
    },
    {
        id: 'R-FALLBACK-001', name: 'Unmatched endpoints → API Explorer', description: 'Every endpoint no other rule placed gets a generic request form + response viewer and is queued for mapping review. Nothing is dropped silently.',
        layer: 'builtin', priority: 10, enabled: true, version: 1,
        apply(ctx) {
            const P = mk(this);
            const out = [];
            const open = ctx.model.endpoints.filter((e) => ctx.forceExplorer.has(e.key) || (!ctx.mapped.has(e.key) && !e.flags.external && !relations_1.BACKGROUND.test(e.segments[e.segments.length - 1] || '')));
            if (!open.length)
                return out;
            out.push(P('screen:scr.explorer', { ...explorerScreen(), sources: open.map((e) => e.key) }));
            out.push(P('nav:nav.explorer', { id: 'nav.explorer', label: 'API Explorer', screen: 'scr.explorer', requiresAuth: false, order: 800 }));
            open.forEach((e, i) => {
                const id = `act.explorer.${i}`;
                out.push(P(disp(e.key), { state: 'explorer', reason: 'No rule matched this endpoint' }));
                out.push(P(`action:${id}`, action(id, e.key, e, 'request', [...(0, ui_helpers_1.queryFields)(e), ...(0, ui_helpers_1.formFields)(e, { withPath: true })])));
                out.push(P(`component:scr.explorer:cx.${i}`, { id: `cx.${i}`, type: 'actionPanel', action: id, title: e.key, order: 10 + i }));
            });
            return out;
        },
    },
];
function explorerScreen() {
    return { id: 'scr.explorer', title: 'API Explorer', kind: 'explorer', sources: [], components: [], ruleId: '', provenance: 'inferred' };
}
exports.BUILTIN_RULES = rules;
const ruleSetVersion = (disabled = [], custom = []) => (0, util_1.hashOf)([rules.map((r) => [r.id, r.version, r.priority, !disabled.includes(r.id)]), custom]).slice(0, 12);
exports.ruleSetVersion = ruleSetVersion;
/* ------------------------------------------------------------------ */
/* Resolution                                                          */
/* ------------------------------------------------------------------ */
function resolve(proposals) {
    const bySlot = new Map();
    proposals.forEach((p) => bySlot.set(p.slot, [...(bySlot.get(p.slot) || []), p]));
    const winners = new Map();
    const conflicts = [];
    const trace = [];
    for (const [slot, list] of bySlot) {
        const sorted = [...list].sort((a, b) => LAYER_RANK[a.layer] - LAYER_RANK[b.layer] || b.priority - a.priority || a.ruleId.localeCompare(b.ruleId));
        const w = sorted[0];
        winners.set(slot, w);
        const rivals = sorted.slice(1).filter((p) => p.layer === w.layer && p.priority === w.priority && (0, util_1.hashOf)(p.value) !== (0, util_1.hashOf)(w.value));
        if (rivals.length)
            conflicts.push({ slot, candidates: [w, ...rivals].map((p) => ({ ruleId: p.ruleId, layer: p.layer })), chosen: w.ruleId });
        if (sorted.length > 1 && (0, util_1.hashOf)(sorted[1].value) !== (0, util_1.hashOf)(w.value))
            trace.push({ slot, winner: w.ruleId, losers: sorted.slice(1).map((p) => p.ruleId) });
    }
    return { winners, conflicts, trace };
}
/** Runs the enabled rules in priority order and assembles screens/actions/nav from the winning proposals. */
function evaluateRules(base, opts = {}) {
    const { model, contract, graph } = base;
    const disabled = new Set(opts.disabledRules || []);
    const overrides = opts.overrides || [];
    const excluded = new Map(overrides.filter((o) => o.decision.exclude !== undefined).map((o) => [o.target, o.decision.exclude]));
    const forceExplorer = new Set([...overrides.filter((o) => o.decision.include).map((o) => o.target), ...(opts.custom?.explorer || [])]);
    const byKey = new Map(model.endpoints.map((e) => [e.key, e]));
    const ctx = {
        model, contract, graph, resources: graph.resources, mapped: new Set(), forceExplorer,
        ep: (k) => byKey.get(k),
        eps: (rid, role) => (graph.resources.find((r) => r.id === rid)?.endpoints || []).filter((x) => x.role === role).map((x) => byKey.get(x.key)),
        has: (rid, role) => (graph.resources.find((r) => r.id === rid)?.endpoints || []).some((x) => x.role === role),
    };
    const proposals = [];
    const ordered = [...rules].filter((r) => r.enabled && !disabled.has(r.id)).sort((a, b) => b.priority - a.priority);
    for (const rule of ordered) {
        const produced = rule.apply(ctx).map((p) => ({ ...p, ruleId: rule.id, layer: rule.layer, priority: rule.priority }));
        produced.forEach((p) => p.slot.startsWith('disp:') && p.value.state === 'mapped' && ctx.mapped.add(p.slot.slice(5)));
        proposals.push(...produced);
    }
    // user overrides (highest layer)
    excluded.forEach((reason, key) => proposals.push({ slot: disp(key), value: { state: 'excluded', reason: reason || 'Excluded by user' }, ruleId: 'USER', layer: 'user', priority: 1000, provenance: 'user' }));
    overrides.filter((o) => o.decision.include).forEach((o) => proposals.push({ slot: disp(o.target), value: { state: 'explorer', reason: 'Sent to the API Explorer by user' }, ruleId: 'USER', layer: 'user', priority: 1000, provenance: 'user' }));
    if (opts.custom)
        proposals.push(...opts.custom.proposals);
    const { winners, conflicts, trace } = resolve(proposals);
    const bySlotPrefix = (prefix) => [...winners.entries()].filter(([s]) => s.startsWith(prefix));
    const dispositions = {};
    bySlotPrefix('disp:').forEach(([slot, p]) => (dispositions[slot.slice(5)] = { ...p.value, ruleId: p.ruleId, provenance: p.provenance }));
    const actions = {};
    bySlotPrefix('action:').forEach(([slot, p]) => (actions[slot.slice(7)] = { ...p.value, ruleId: p.ruleId, provenance: p.provenance }));
    const screens = new Map();
    bySlotPrefix('screen:').forEach(([slot, p]) => screens.set(slot.slice(7), { ...p.value, components: [], ruleId: p.ruleId, provenance: p.provenance }));
    bySlotPrefix('component:').forEach(([slot, p]) => {
        const sid = slot.slice(10, slot.indexOf(':', 10));
        const s = screens.get(sid);
        if (s)
            s.components.push({ ...p.value, ruleId: p.ruleId });
    });
    bySlotPrefix('table:').forEach(([slot, p]) => {
        const [, sid, part] = slot.split(':');
        const table = screens.get(sid)?.components.find((c) => c.id === 'c.table');
        if (!table)
            return;
        if (part === 'columns')
            Object.assign(table, p.value);
        else
            table[part] = p.value;
        table.ruleIds = { ...(table.ruleIds || {}), [part]: p.ruleId };
    });
    // user-excluded endpoints: remove what depends on them
    const dead = new Set(Object.entries(dispositions).filter(([, d]) => d.state === 'excluded' || d.state === 'background' || d.state === 'explorer').map(([k]) => k));
    for (const [id, a] of Object.entries(actions))
        if (dead.has(a.endpoint) && !id.startsWith('act.explorer.'))
            delete actions[id];
    const stripRows = (c) => {
        if (Array.isArray(c.rowActions))
            c.rowActions = c.rowActions.filter((r) => !r.action || actions[r.action]);
        return c;
    };
    for (const s of screens.values()) {
        s.components = s.components.filter((c) => !c.action || actions[c.action]).map(stripRows).sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
        s.sources = s.sources.filter((k) => !dead.has(k));
        // rules mark auth-protected screens
        if (s.requiresAuth === undefined)
            s.requiresAuth = s.sources.some((k) => byKey.get(k)?.auth.type !== 'noauth') && !!graph.authLogin;
        const t = overrides.find((o) => o.target === s.id && o.decision.title);
        if (t) {
            s.title = t.decision.title;
            s.provenance = 'user';
        }
    }
    // Prune what became empty after exclusions: modals/sections/buttons without targets, then screens with no useful content.
    const originalSourceCount = new Map([...screens.values()].map((s) => [s.id, s.sources.length]));
    let real = [...screens.values()];
    for (let pass = 0; pass < 4; pass++) {
        const alive = new Set(real.map((s) => s.id));
        for (const s of real) {
            s.components = s.components.filter((c) => {
                if (c.type === 'button' && !c.action && c.opens && !alive.has(c.opens))
                    return false;
                if (c.type === 'section' && !s.components.some((x) => x.parent === c.id))
                    return false;
                return true;
            });
            s.components = s.components.filter((c) => !c.parent || s.components.some((x) => x.id === c.parent));
        }
        real = real.filter((s) => {
            const useful = s.components.some((c) => c.type !== 'idPrompt');
            const orphaned = (originalSourceCount.get(s.id) || 0) > 0 && s.sources.length === 0 && s.kind !== 'explorer';
            return useful && !orphaned;
        });
    }
    const realIds = new Set(real.map((s) => s.id));
    for (const s of real)
        for (const c of s.components) {
            if (c.opens && !realIds.has(c.opens))
                c.type = 'responseViewer';
        }
    const nav = bySlotPrefix('nav:')
        .map(([, p]) => p.value)
        .filter((n) => (n.screen ? realIds.has(n.screen) : !!n.action && !!actions[n.action]))
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.label.localeCompare(b.label));
    const review = [];
    Object.entries(dispositions).forEach(([k, d]) => d.state === 'explorer' && review.push({ endpoint: k, reason: d.reason || 'No rule matched' }));
    graph.unresolved.forEach((u) => !review.some((r) => r.endpoint === u.endpoint) && review.push({ endpoint: u.endpoint, reason: u.reason }));
    graph.cycles.forEach((c) => review.push({ endpoint: c[0], reason: `Circular dependency: ${c.join(' → ')}` }));
    // workflow from the login chain
    const workflows = [];
    if (actions['act.auth.login']) {
        const steps = ['act.auth.login', actions['act.auth.session'] && 'act.auth.session', actions['act.auth.logout'] && 'act.auth.logout'].filter(Boolean);
        if (steps.length > 1)
            workflows.push({ id: 'wf.auth', name: 'Login → profile → logout', steps, provenance: 'inferred' });
    }
    return { screens: real, actions, nav, dispositions, workflows, review, conflicts, trace };
}
