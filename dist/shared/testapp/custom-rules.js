"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateRule = validateRule;
exports.evaluateCustomRules = evaluateCustomRules;
const relations_1 = require("./relations");
const FACTS = ['method', 'path', 'name', 'folder', 'folderPath', 'role', 'resource', 'auth', 'host', 'hasBody', 'hasExamples', 'exampleCodes'];
const OPS = ['eq', 'neq', 'in', 'includes', 'startsWith', 'endsWith', 'regex', 'exists', 'gte', 'lte'];
const ROLES = ['list', 'get', 'create', 'update', 'patch', 'delete', 'search', 'action', 'nested-list', 'nested-create', 'nested-get', 'nested-update', 'nested-delete', 'auth.login', 'auth.logout', 'auth.refresh', 'auth.session', 'unknown'];
const LIMITS = { maxDepth: 6, maxLeaves: 40, maxActions: 6, maxRegex: 200, maxInput: 500 };
/** Nested quantifiers like (a+)+ are the classic catastrophic-backtracking shape. */
const DANGEROUS_REGEX = /\([^)]*[+*][^)]*\)\s*[+*{]|\([^)]*\|[^)]*\)\s*[+*]{1,}/;
function validateCond(c, depth, leaves, errors, path) {
    if (depth > LIMITS.maxDepth)
        return errors.push(`${path}: conditions nested deeper than ${LIMITS.maxDepth}`);
    if (!c || typeof c !== 'object')
        return errors.push(`${path}: condition must be an object`);
    if ('all' in c || 'any' in c) {
        const list = c.all ?? c.any;
        if (!Array.isArray(list) || !list.length)
            return errors.push(`${path}: all/any needs a non-empty list`);
        list.forEach((x, i) => validateCond(x, depth + 1, leaves, errors, `${path}.${'all' in c ? 'all' : 'any'}[${i}]`));
        return;
    }
    if ('not' in c)
        return validateCond(c.not, depth + 1, leaves, errors, `${path}.not`);
    leaves.n++;
    if (leaves.n > LIMITS.maxLeaves)
        return errors.push(`more than ${LIMITS.maxLeaves} conditions`);
    if (!FACTS.includes(c.fact))
        return errors.push(`${path}: unknown fact "${c.fact}" (allowed: ${FACTS.join(', ')})`);
    if (!OPS.includes(c.op))
        return errors.push(`${path}: unknown operator "${c.op}" (allowed: ${OPS.join(', ')})`);
    if (c.op === 'regex') {
        if (typeof c.value !== 'string' || c.value.length > LIMITS.maxRegex)
            return errors.push(`${path}: regex must be a string up to ${LIMITS.maxRegex} characters`);
        if (DANGEROUS_REGEX.test(c.value))
            return errors.push(`${path}: regex looks like it could backtrack catastrophically`);
        try {
            new RegExp(c.value, 'i');
        }
        catch {
            errors.push(`${path}: invalid regular expression`);
        }
    }
    if (c.op === 'in' && !Array.isArray(c.value))
        errors.push(`${path}: "in" needs a list`);
}
/** Returns a list of problems; empty = valid. */
function validateRule(rule) {
    const errors = [];
    const r = rule;
    if (!r || typeof r !== 'object')
        return ['rule must be an object'];
    if (typeof r.id !== 'string' || !/^[A-Za-z0-9._-]{3,60}$/.test(r.id))
        errors.push('id must be 3-60 characters: letters, digits, . _ -');
    if (typeof r.name !== 'string' || !r.name.trim() || r.name.length > 120)
        errors.push('name is required (max 120 characters)');
    if (r.priority !== undefined && (typeof r.priority !== 'number' || r.priority < 0 || r.priority > 1000))
        errors.push('priority must be a number 0-1000');
    validateCond(r.when, 0, { n: 0 }, errors, 'when');
    if (!Array.isArray(r.then) || !r.then.length)
        errors.push('then needs at least one action');
    else {
        if (r.then.length > LIMITS.maxActions)
            errors.push(`at most ${LIMITS.maxActions} actions`);
        r.then.forEach((a, i) => {
            if (!a || !['exclude', 'background', 'explorer', 'setRole'].includes(a.do))
                errors.push(`then[${i}]: unknown action "${a?.do}" (allowed: exclude, background, explorer, setRole)`);
            if (a?.do === 'setRole') {
                if (!ROLES.includes(a.role))
                    errors.push(`then[${i}]: unknown role "${a.role}"`);
                if (a.resource !== undefined && !/^[A-Za-z0-9_.-]{1,80}$/.test(String(a.resource)))
                    errors.push(`then[${i}]: invalid resource name`);
                if (!['unknown', 'auth.login', 'auth.logout', 'auth.refresh', 'auth.session', 'action'].includes(a.role) && !a.resource)
                    errors.push(`then[${i}]: setRole "${a.role}" needs a resource`);
            }
            if (a?.do === 'exclude' && a.reason !== undefined && String(a.reason).length > 200)
                errors.push(`then[${i}]: reason too long`);
        });
    }
    return errors;
}
function factsOf(e, role) {
    return {
        method: e.method,
        path: e.path,
        name: e.name,
        folder: e.folderPath.join('/'),
        folderPath: e.folderPath,
        role: role.role,
        resource: role.resource ?? '',
        auth: e.auth.type,
        host: e.host ?? '',
        hasBody: e.body.mode !== 'none',
        hasExamples: e.examples.length > 0,
        exampleCodes: e.examples.map((x) => x.code),
    };
}
function test(c, f) {
    if ('all' in c)
        return c.all.every((x) => test(x, f));
    if ('any' in c)
        return c.any.some((x) => test(x, f));
    if ('not' in c)
        return !test(c.not, f);
    const v = f[c.fact];
    const arr = Array.isArray(v);
    const str = (x) => String(x ?? '').slice(0, LIMITS.maxInput);
    switch (c.op) {
        case 'eq': return arr ? v.some((x) => x === c.value) : typeof v === 'string' && typeof c.value === 'string' ? v.toLowerCase() === c.value.toLowerCase() : v === c.value;
        case 'neq': return !test({ fact: c.fact, op: 'eq', value: c.value }, f);
        case 'in': return c.value.some((x) => (arr ? v.includes(x) : typeof v === 'string' && typeof x === 'string' ? v.toLowerCase() === x.toLowerCase() : v === x));
        case 'includes': return arr ? v.some((x) => str(x).toLowerCase() === str(c.value).toLowerCase()) : str(v).toLowerCase().includes(str(c.value).toLowerCase());
        case 'startsWith': return str(v).toLowerCase().startsWith(str(c.value).toLowerCase());
        case 'endsWith': return str(v).toLowerCase().endsWith(str(c.value).toLowerCase());
        case 'regex': return new RegExp(c.value, 'i').test(arr ? v.map(str).join(' ') : str(v));
        case 'exists': return arr ? v.length > 0 : v !== '' && v !== null && v !== undefined && v !== false;
        case 'gte': return Number(v) >= Number(c.value);
        case 'lte': return Number(v) <= Number(c.value);
        default: return false;
    }
}
/** Evaluates enabled custom rules. Invalid rules are reported and skipped, never executed. */
function evaluateCustomRules(model, rules, roleFor = relations_1.classify) {
    const out = { roleOverrides: {}, proposals: [], explorer: new Set(), matches: [], invalid: [] };
    const sorted = [...rules].filter((r) => r && r.enabled !== false).sort((a, b) => (b.priority ?? 100) - (a.priority ?? 100) || String(a.id).localeCompare(String(b.id)));
    for (const rule of sorted) {
        const errors = validateRule(rule);
        if (errors.length) {
            out.invalid.push({ ruleId: String(rule?.id), errors });
            continue;
        }
        const hits = [];
        for (const e of model.endpoints) {
            let matched = false;
            try {
                matched = test(rule.when, factsOf(e, roleFor(e)));
            }
            catch {
                matched = false;
            }
            if (!matched)
                continue;
            hits.push(e.key);
            for (const a of rule.then) {
                const base = { ruleId: rule.id, layer: 'collection', priority: rule.priority ?? 100, provenance: 'user' };
                if (a.do === 'exclude')
                    out.proposals.push({ ...base, slot: `disp:${e.key}`, value: { state: 'excluded', reason: a.reason || `Excluded by rule ${rule.id}` } });
                else if (a.do === 'background')
                    out.proposals.push({ ...base, slot: `disp:${e.key}`, value: { state: 'background', reason: `Marked background by rule ${rule.id}` } });
                else if (a.do === 'explorer') {
                    out.explorer.add(e.key);
                    out.proposals.push({ ...base, slot: `disp:${e.key}`, value: { state: 'explorer', reason: `Sent to the API Explorer by rule ${rule.id}` } });
                }
                else if (a.do === 'setRole' && !out.roleOverrides[e.key])
                    out.roleOverrides[e.key] = { role: a.role, resource: a.resource ?? null };
            }
        }
        out.matches.push({ ruleId: rule.id, name: rule.name, endpoints: hits });
    }
    return out;
}
