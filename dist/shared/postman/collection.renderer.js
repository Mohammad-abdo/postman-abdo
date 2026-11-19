"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.renderCollection = renderCollection;
exports.findItem = findItem;
const auth_mapper_1 = require("./auth.mapper");
const request_mapper_1 = require("./request.mapper");
const script_mapper_1 = require("./script.mapper");
const variables_1 = require("./variables");
const byOrder = (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);
/** Renders database rows of one collection as Postman Collection v2.1 JSON. */
function renderCollection(collection, folders, requests, opts = {}) {
    let reqs = requests.filter((r) => r.type !== 'websocket');
    if (opts.draft) {
        const draft = opts.draft;
        const idx = reqs.findIndex((r) => r.id === draft.id);
        if (idx >= 0)
            reqs[idx] = { ...reqs[idx], ...draft };
        else
            reqs = [...reqs, draft];
    }
    const children = (parentId) => {
        const childFolders = folders.filter((f) => (f.parentId || null) === parentId).sort(byOrder).map(folderItem);
        const childRequests = reqs
            .filter((r) => (r.folderId || null) === parentId)
            .sort(byOrder)
            .map((r) => (0, request_mapper_1.requestToV21Item)(r, opts));
        // Folders first, then requests — the order Postman's sidebar shows.
        return [...childFolders, ...childRequests];
    };
    const folderItem = (f) => {
        const item = { id: f.id, name: f.name, item: children(f.id) };
        if (f.description)
            item.description = f.description;
        const auth = (0, auth_mapper_1.authToV21)(f.auth);
        if (auth)
            item.auth = auth;
        const events = (0, script_mapper_1.scriptsToEvents)(f.preRequestScript, f.testScript);
        if (events.length)
            item.event = events;
        return item;
    };
    const out = {
        info: {
            _postman_id: collection.id,
            name: collection.name,
            ...(collection.description ? { description: collection.description } : {}),
            schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
        },
        item: children(null),
    };
    const auth = (0, auth_mapper_1.authToV21)(collection.auth);
    if (auth)
        out.auth = auth;
    const events = (0, script_mapper_1.scriptsToEvents)(collection.preRequestScript, collection.testScript);
    if (events.length)
        out.event = events;
    const variables = (0, variables_1.variablesToV21)(collection.variables, opts.useCurrentValues);
    if (variables.length)
        out.variable = variables;
    return out;
}
function findItem(items, id) {
    for (const it of items) {
        if (it.id === id)
            return it;
        if (it.item) {
            const found = findItem(it.item, id);
            if (found)
                return found;
        }
    }
    return null;
}
