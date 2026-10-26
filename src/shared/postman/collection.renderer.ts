import { authToV21 } from './auth.mapper';
import { RenderOptions, requestToV21Item } from './request.mapper';
import { scriptsToEvents } from './script.mapper';
import { RequestModel, V2Json } from './types';
import { variablesToV21 } from './variables';

export interface CollectionRenderOptions extends RenderOptions {
  /** Replace a saved request (or append an unsaved one) with this draft. */
  draft?: RequestModel;
  /** Use current values instead of initial values for collection variables. */
  useCurrentValues?: boolean;
}

interface Sortable {
  sortOrder?: number;
}

const byOrder = (a: Sortable, b: Sortable) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0);

/** Renders database rows of one collection as Postman Collection v2.1 JSON. */
export function renderCollection(collection: any, folders: any[], requests: any[], opts: CollectionRenderOptions = {}): V2Json {
  let reqs: RequestModel[] = requests.filter((r) => r.type !== 'websocket');
  if (opts.draft) {
    const draft = opts.draft;
    const idx = reqs.findIndex((r) => r.id === draft.id);
    if (idx >= 0) reqs[idx] = { ...reqs[idx], ...draft };
    else reqs = [...reqs, draft];
  }

  const children = (parentId: string | null): V2Json[] => {
    const childFolders = folders.filter((f) => (f.parentId || null) === parentId).sort(byOrder).map(folderItem);
    const childRequests = reqs
      .filter((r) => (r.folderId || null) === parentId)
      .sort(byOrder)
      .map((r) => requestToV21Item(r, opts));
    // Folders first, then requests — the order Postman's sidebar shows.
    return [...childFolders, ...childRequests];
  };

  const folderItem = (f: any): V2Json => {
    const item: V2Json = { id: f.id, name: f.name, item: children(f.id) };
    if (f.description) item.description = f.description;
    const auth = authToV21(f.auth);
    if (auth) item.auth = auth;
    const events = scriptsToEvents(f.preRequestScript, f.testScript);
    if (events.length) item.event = events;
    return item;
  };

  const out: V2Json = {
    info: {
      _postman_id: collection.id,
      name: collection.name,
      ...(collection.description ? { description: collection.description } : {}),
      schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    item: children(null),
  };
  const auth = authToV21(collection.auth);
  if (auth) out.auth = auth;
  const events = scriptsToEvents(collection.preRequestScript, collection.testScript);
  if (events.length) out.event = events;
  const variables = variablesToV21(collection.variables, opts.useCurrentValues);
  if (variables.length) out.variable = variables;
  return out;
}

export function findItem(items: V2Json[], id: string): V2Json | null {
  for (const it of items) {
    if (it.id === id) return it;
    if (it.item) {
      const found = findItem(it.item, id);
      if (found) return found;
    }
  }
  return null;
}
