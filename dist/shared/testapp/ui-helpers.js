"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.epOf = exports.contractOf = exports.singularTitle = exports.filterParams = exports.searchParam = exports.sortParams = exports.successExample = void 0;
exports.findList = findList;
exports.columnsFor = columnsFor;
exports.idFieldOf = idFieldOf;
exports.paging = paging;
exports.inputFor = inputFor;
exports.formFields = formFields;
exports.queryFields = queryFields;
const util_1 = require("./util");
const TOTAL_KEYS = /^(total|totalcount|total_count|count|totalitems|total_items|totalelements|totalrecords)$/i;
const PAGING = /^(page|pagenumber|page_number|offset|skip|cursor|after|before|limit|per_page|perpage|pagesize|page_size|size|take)$/i;
const SORT = /^(sort|sortby|sort_by|order|orderby|order_by|direction|dir)$/i;
const SEARCH = /^(q|search|query|keyword|term)$/i;
const successExample = (e) => e.examples.find((x) => x.code >= 200 && x.code < 300 && x.body !== undefined) || e.examples.find((x) => x.code >= 200 && x.code < 300);
exports.successExample = successExample;
/** Finds the array of records in an example response (top-level or up to two levels deep). */
function findList(body) {
    if (Array.isArray(body))
        return { path: '$', sample: (0, util_1.isObj)(body[0]) ? body[0] : undefined };
    if (!(0, util_1.isObj)(body))
        return null;
    const search = (obj, prefix, depth) => {
        for (const [k, v] of Object.entries(obj))
            if (Array.isArray(v))
                return { path: `${prefix}.${k}`, sample: (0, util_1.isObj)(v[0]) ? v[0] : undefined };
        if (depth < 2)
            for (const [k, v] of Object.entries(obj))
                if ((0, util_1.isObj)(v)) {
                    const r = search(v, `${prefix}.${k}`, depth + 1);
                    if (r)
                        return r;
                }
        return null;
    };
    const found = search(body, '$', 0);
    if (!found)
        return null;
    const total = findKey(body, '$', 0, TOTAL_KEYS);
    return { ...found, totalPath: total };
}
function findKey(obj, prefix, depth, re) {
    for (const [k, v] of Object.entries(obj))
        if (re.test(k) && typeof v === 'number')
            return `${prefix}.${k}`;
    if (depth < 2)
        for (const [k, v] of Object.entries(obj))
            if ((0, util_1.isObj)(v)) {
                const r = findKey(v, `${prefix}.${k}`, depth + 1, re);
                if (r)
                    return r;
            }
    return undefined;
}
function columnsFor(sample) {
    if (!sample)
        return [];
    const scalar = Object.keys(sample).filter((k) => sample[k] === null || typeof sample[k] !== 'object');
    const pref = ['id', 'name', 'title', 'email', 'status', 'type'];
    return [...pref.filter((p) => scalar.includes(p)), ...scalar.filter((k) => !pref.includes(k))].slice(0, 8);
}
function idFieldOf(sample) {
    if (!sample)
        return 'id';
    if ('id' in sample)
        return 'id';
    return Object.keys(sample).find((k) => /id$/i.test(k)) || 'id';
}
function paging(e) {
    const names = e.query.map((q) => q.name);
    const pick = (re) => names.find((n) => re.test(n));
    const cursor = pick(/^(cursor|after|before)$/i);
    const offset = pick(/^(offset|skip)$/i);
    const page = pick(/^(page|pagenumber|page_number)$/i);
    const size = pick(/^(limit|per_page|perpage|pagesize|page_size|size|take)$/i);
    if (!cursor && !offset && !page && !size)
        return null;
    return { kind: cursor ? 'cursor' : offset ? 'offset' : 'page', params: { page, offset, cursor, size } };
}
const sortParams = (e) => e.query.map((q) => q.name).filter((n) => SORT.test(n));
exports.sortParams = sortParams;
const searchParam = (e) => e.query.map((q) => q.name).find((n) => SEARCH.test(n));
exports.searchParam = searchParam;
const filterParams = (e) => e.query.map((q) => q.name).filter((n) => !PAGING.test(n) && !SORT.test(n) && !SEARCH.test(n));
exports.filterParams = filterParams;
function inputFor(name, sample, fileKind) {
    if (fileKind)
        return 'file';
    if (/pass(word)?$/i.test(name))
        return 'password';
    if (/e-?mail/i.test(name))
        return 'email';
    if (/(date|_at|At|time)$/.test(name) || /(birth|expires)/i.test(name))
        return 'date';
    if (typeof sample === 'boolean')
        return 'checkbox';
    if (typeof sample === 'number')
        return 'number';
    if (/(description|content|notes?|comment|message|body|bio)$/i.test(name))
        return 'textarea';
    return 'text';
}
/** Form fields for an endpoint's request body (+ path params when asked). */
function formFields(e, opts = {}) {
    const out = [];
    if (opts.withPath)
        e.pathParams.forEach((p) => out.push({ name: p.name, in: 'path', input: 'text', example: p.example }));
    const ex = e.body.example;
    if ((0, util_1.isObj)(ex)) {
        Object.entries(ex).forEach(([k, v]) => {
            if (opts.skipId && k === 'id')
                return;
            if (v !== null && typeof v === 'object')
                return out.push({ name: k, in: 'body', input: 'textarea', example: JSON.stringify(v) });
            out.push({ name: k, in: 'body', input: inputFor(k, v), example: v == null ? '' : String(v) });
        });
    }
    e.body.fields.forEach((f) => out.push({ name: f.name, in: 'form', input: inputFor(f.name, f.example, f.kind === 'file'), example: f.example }));
    if (e.body.mode === 'raw' && !(0, util_1.isObj)(ex) && ex === undefined && e.body.contentType === undefined && e.method !== 'GET') {
        /* raw non-JSON body: no structured fields; the explorer/response viewer covers it */
    }
    return out;
}
function queryFields(e) {
    return e.query.map((q) => ({ name: q.name, in: 'query', input: inputFor(q.name, q.example), example: q.example }));
}
const singularTitle = (resourceId) => {
    const n = resourceId.split('.').pop();
    const t = (0, util_1.titleCase)(n);
    return /ies$/i.test(t) ? t.replace(/ies$/i, 'y') : /(ss|us)$/i.test(t) ? t : t.replace(/s$/i, '');
};
exports.singularTitle = singularTitle;
const contractOf = (c, key) => c.endpoints[key];
exports.contractOf = contractOf;
const epOf = (m, key) => m.endpoints.find((e) => e.key === key);
exports.epOf = epOf;
