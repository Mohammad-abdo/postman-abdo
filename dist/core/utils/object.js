"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.safeFileName = exports.sameJson = void 0;
exports.pick = pick;
exports.reorder = reorder;
/** Keeps only the listed keys that are not `undefined`. */
function pick(obj, keys) {
    const out = {};
    keys.forEach((k) => {
        if (obj[k] !== undefined)
            out[k] = obj[k];
    });
    return out;
}
const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);
exports.sameJson = sameJson;
/** Moves `id` to `index` within an ordered list and returns the new id order. */
function reorder(ids, id, index) {
    const rest = ids.filter((x) => x !== id);
    rest.splice(Math.max(0, Math.min(index, rest.length)), 0, id);
    return rest;
}
const safeFileName = (name) => name.replace(/[^\w\- ]+/g, '_');
exports.safeFileName = safeFileName;
