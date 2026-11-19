"use strict";
/**
 * Postman-style mock matching: method must match, then the example whose URL path best matches wins.
 * Exact segments beat variables (`{{id}}`, `:id`), matching query params add to the score,
 * and 2xx examples are preferred. `x-mock-response-*` headers narrow the candidates.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.replaceVariables = replaceVariables;
exports.findBestMatch = findBestMatch;
const isVariableSegment = (s) => /^\{\{.+\}\}$/.test(s) || s.startsWith(':');
function replaceVariables(text, vars) {
    return text.replace(/\{\{([^{}]+)\}\}/g, (match, key) => vars.get(key.trim()) ?? match);
}
/** Drops the protocol and host (or a leading `{{baseUrl}}`) and splits path and query. */
function splitUrl(raw) {
    let rest = raw.trim().replace(/^[a-z][\w+.-]*:\/\//i, '');
    rest = rest.startsWith('{{') ? rest.replace(/^\{\{[^}]+\}\}/, '') : rest.replace(/^[^/?#]*/, '');
    const [path, query = ''] = rest.split('#')[0].split('?');
    return { segments: path.split('/').filter(Boolean), query: new URLSearchParams(query) };
}
function score(exampleUrl, path, query) {
    const expected = splitUrl(exampleUrl);
    if (expected.segments.length !== path.length)
        return -1;
    let total = 0;
    for (let i = 0; i < path.length; i++) {
        const a = expected.segments[i];
        const b = path[i];
        if (a === b || safeDecode(a) === safeDecode(b))
            total += 10;
        else if (isVariableSegment(a))
            total += 1;
        else
            return -1;
    }
    expected.query.forEach((value, key) => {
        if (query.get(key) === value)
            total += 3;
        else if (query.has(key))
            total += 1;
        else
            total -= 1;
    });
    return total;
}
function safeDecode(s) {
    try {
        return decodeURIComponent(s);
    }
    catch {
        return s;
    }
}
function findBestMatch(candidates, q) {
    const path = q.path.split('/').filter(Boolean);
    let best = null;
    let bestScore = -1;
    for (const c of candidates) {
        if (c.method.toUpperCase() !== q.method.toUpperCase())
            continue;
        if (q.responseId && c.id !== q.responseId)
            continue;
        if (q.responseName && c.name !== q.responseName)
            continue;
        if (q.responseCode && String(c.code) !== q.responseCode)
            continue;
        let s = score(c.url, path, q.query);
        if (s < 0)
            continue;
        if (c.code >= 200 && c.code < 300)
            s += 2;
        if (s > bestScore) {
            best = c;
            bestScore = s;
        }
    }
    return best;
}
