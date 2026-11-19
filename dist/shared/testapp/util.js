"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.singular = exports.titleCase = exports.isObj = exports.clone = exports.Rng = exports.hashOf = exports.sha256 = void 0;
exports.stableStringify = stableStringify;
exports.getPath = getPath;
exports.setPath = setPath;
const crypto_1 = __importDefault(require("crypto"));
/** JSON.stringify with sorted keys, so equal data always hashes equally. */
function stableStringify(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    const obj = value;
    return `{${Object.keys(obj)
        .sort()
        .filter((k) => obj[k] !== undefined)
        .map((k) => `${JSON.stringify(k)}:${stableStringify(obj[k])}`)
        .join(',')}}`;
}
const sha256 = (text) => crypto_1.default.createHash('sha256').update(text).digest('hex');
exports.sha256 = sha256;
const hashOf = (value) => (0, exports.sha256)(stableStringify(value));
exports.hashOf = hashOf;
/** Seeded PRNG (mulberry32). `state` is the next seed, so a stream can be resumed. */
class Rng {
    state;
    constructor(state) {
        this.state = state;
        this.state = state >>> 0;
    }
    next() {
        this.state = (this.state + 0x6d2b79f5) >>> 0;
        let t = this.state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    int(min, max) {
        return Math.floor(this.next() * (max - min + 1)) + min;
    }
    hex(len) {
        let s = '';
        while (s.length < len)
            s += Math.floor(this.next() * 16).toString(16);
        return s;
    }
}
exports.Rng = Rng;
const clone = (v) => (v === undefined ? v : JSON.parse(JSON.stringify(v)));
exports.clone = clone;
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
exports.isObj = isObj;
/** Reads `$.a.b[0].c` style paths. Closed evaluator: no scripts. */
function getPath(data, path) {
    if (!path || path === '$')
        return data;
    const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || [];
    let cur = data;
    for (const t of tokens) {
        if (cur == null)
            return undefined;
        cur = cur[t];
    }
    return cur;
}
function setPath(data, path, value) {
    if (!path || path === '$')
        return value;
    const tokens = path.replace(/^\$\.?/, '').match(/[^.[\]]+/g) || [];
    let cur = data;
    tokens.slice(0, -1).forEach((t) => (cur = cur?.[t]));
    if (cur && typeof cur === 'object')
        cur[tokens[tokens.length - 1]] = value;
    return data;
}
const titleCase = (s) => s
    .replace(/[-_.]+/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
exports.titleCase = titleCase;
const singular = (s) => (/ies$/.test(s) ? s.replace(/ies$/, 'y') : /(ss|us)$/.test(s) ? s : s.replace(/s$/, ''));
exports.singular = singular;
