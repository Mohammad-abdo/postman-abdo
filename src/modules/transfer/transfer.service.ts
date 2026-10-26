import { Prisma } from '@prisma/client';
import YAML from 'yaml';
import { prisma, json as toJsonColumn } from '../../core/database/prisma';
import { BadRequest } from '../../core/errors/http-error';
import { authFromV2 } from '../../shared/postman/auth.mapper';
import { descriptionText } from '../../shared/postman/kv.mapper';
import { exampleFromV2, requestFromV2Item } from '../../shared/postman/request.mapper';
import { scriptsFromEvents } from '../../shared/postman/script.mapper';
import { V2Json, Variable } from '../../shared/postman/types';
import { variablesFromV2 } from '../../shared/postman/variables';
import { parseCurl } from './curl.parser';
import { isOpenApi, openApiToCollection, upgradeV1Collection } from './openapi.converter';

const isV1Collection = (json: V2Json) => Array.isArray(json.requests) && !json.info;
const isCollection = (json: V2Json) => Boolean(json.info && Array.isArray(json.item)) || isV1Collection(json);
const isEnvironment = (json: V2Json) => Array.isArray(json.values) && Boolean(json.name || json._postman_variable_scope);
const isDataDump = (json: V2Json) => Array.isArray(json.collections) || Array.isArray(json.environments);

function parseStructured(text: string): V2Json | null {
  try {
    return JSON.parse(text);
  } catch {
    try {
      const parsed = YAML.parse(text);
      return typeof parsed === 'object' ? parsed : null;
    } catch {
      return null;
    }
  }
}

export const transferService = {
  /** Recursively writes v2 items (folders + requests + examples) under a parent folder. */
  async importItems(collectionId: string, parentId: string | null, items: V2Json[], startOrder = 0): Promise<void> {
    let order = startOrder;
    for (const item of items || []) {
      if (Array.isArray(item.item)) {
        const scripts = scriptsFromEvents(item.event);
        const folder = await prisma.folder.create({
          data: {
            collectionId,
            parentId,
            name: item.name || 'New Folder',
            description: descriptionText(item.description),
            auth: authFromV2(item.auth),
            preRequestScript: scripts.pre,
            testScript: scripts.test,
            sortOrder: order++,
          },
        });
        await this.importItems(collectionId, folder.id, item.item);
        continue;
      }
      const request = await prisma.request.create({
        data: { ...requestFromV2Item(item), collectionId, folderId: parentId, sortOrder: order++ } as Prisma.RequestUncheckedCreateInput,
      });
      const responses: V2Json[] = Array.isArray(item.response) ? item.response : [];
      for (const [i, response] of responses.entries()) {
        await prisma.example.create({ data: { ...exampleFromV2(response, i), requestId: request.id } as Prisma.ExampleUncheckedCreateInput });
      }
    }
  },

  async importCollection(workspaceId: string, json: V2Json, nameOverride?: string) {
    const collection = isV1Collection(json) ? await upgradeV1Collection(json) : json;
    const info = collection.info || {};
    const scripts = scriptsFromEvents(collection.event);
    const created = await prisma.collection.create({
      data: {
        workspaceId,
        name: nameOverride || info.name || 'Imported Collection',
        description: descriptionText(info.description),
        auth: toJsonColumn(authFromV2(collection.auth)),
        variables: toJsonColumn(variablesFromV2(collection.variable)),
        preRequestScript: scripts.pre,
        testScript: scripts.test,
        sortOrder: await prisma.collection.count({ where: { workspaceId } }),
      },
    });
    await this.importItems(created.id, null, collection.item || []);
    return created;
  },

  /** Environment files become new environments; a globals file merges into the workspace globals. */
  async importEnvironment(workspaceId: string, json: V2Json) {
    const values: Variable[] = (json.values || []).map((v: V2Json) => ({
      key: v.key,
      value: v.value == null ? '' : String(v.value),
      currentValue: '',
      type: v.type === 'secret' ? 'secret' : 'default',
      enabled: v.enabled !== false,
    }));
    if (json._postman_variable_scope === 'globals') {
      const globals = await prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } });
      if (globals) {
        const existing = ((globals.variables as unknown as Variable[]) || []).filter((e) => !values.some((v) => v.key === e.key));
        return prisma.environment.update({ where: { id: globals.id }, data: { variables: toJsonColumn([...existing, ...values]) } });
      }
    }
    return prisma.environment.create({
      data: { workspaceId, name: json.name || 'Imported Environment', variables: toJsonColumn(values) },
    });
  },

  /** Detects the format of arbitrary text (collection, environment, dump, OpenAPI, cURL) and imports it. */
  async importText(workspaceId: string, text: string, fileName?: string) {
    const trimmed = text.trim();
    if (/^curl\s/i.test(trimmed)) return { kind: 'request', request: parseCurl(trimmed) };

    const json = parseStructured(trimmed);
    if (!json) throw BadRequest('Unrecognized format. Paste a Postman collection, environment, OpenAPI spec or cURL command.');

    if (isDataDump(json)) {
      for (const c of json.collections || []) await this.importCollection(workspaceId, c);
      for (const e of json.environments || []) await this.importEnvironment(workspaceId, e);
      return { kind: 'dump', collections: (json.collections || []).length, environments: (json.environments || []).length };
    }
    if (isCollection(json)) return { kind: 'collection', collection: await this.importCollection(workspaceId, json) };
    if (isEnvironment(json)) return { kind: 'environment', environment: await this.importEnvironment(workspaceId, json) };
    if (isOpenApi(json)) return { kind: 'collection', collection: await this.importCollection(workspaceId, await openApiToCollection(json)) };
    throw BadRequest(`Could not detect the format of ${fileName || 'the input'}`);
  },

  async fetchText(url: string) {
    const response = await fetch(url);
    if (!response.ok) throw BadRequest(`Could not fetch ${url} (${response.status})`);
    return response.text();
  },
};
