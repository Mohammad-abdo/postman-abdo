import { Environment } from '@prisma/client';
import { prisma, json } from '../../core/database/prisma';
import { sameJson } from '../../core/utils/object';
import { ScopeValue, mergeScope, scopeValues } from '../../shared/postman/variables';
import { environmentService } from '../environments/environment.service';
import { RunResult } from './runtime/runtime.types';

export interface LoadedScopes {
  environment: Environment | null;
  globals: Environment;
}

export interface VariableUpdates {
  environment?: { id: string; variables: unknown[] };
  globals?: { id: string; variables: unknown[] };
  collection?: { id: string; variables: unknown[] };
}

export async function loadScopes(workspaceId: string, environmentId?: string | null): Promise<LoadedScopes> {
  const [environment, globals] = await Promise.all([
    environmentId ? prisma.environment.findFirst({ where: { id: environmentId, workspaceId } }) : null,
    environmentService.globals(workspaceId),
  ]);
  return { environment, globals };
}

export const runtimeValues = (scopes: LoadedScopes) => ({
  environment: scopes.environment ? scopeValues(scopes.environment.variables) : [],
  globals: scopeValues(scopes.globals.variables),
});

async function persistEnvironment(env: Environment, values: ScopeValue[]) {
  const merged = mergeScope(env.variables, values);
  if (sameJson(merged, env.variables || [])) return undefined;
  await prisma.environment.update({ where: { id: env.id }, data: { variables: json(merged) } });
  return { id: env.id, variables: merged };
}

/** Writes variable changes made by scripts back to the database as current values. */
export async function persistScopes(result: RunResult, scopes: LoadedScopes, collectionId?: string | null): Promise<VariableUpdates> {
  const updates: VariableUpdates = {};
  if (scopes.environment) updates.environment = await persistEnvironment(scopes.environment, result.environment);
  updates.globals = await persistEnvironment(scopes.globals, result.globals);

  if (collectionId) {
    const collection = await prisma.collection.findUnique({ where: { id: collectionId } });
    if (collection) {
      const merged = mergeScope(collection.variables, result.collectionVariables);
      if (!sameJson(merged, collection.variables || [])) {
        await prisma.collection.update({ where: { id: collectionId }, data: { variables: json(merged) } });
        updates.collection = { id: collectionId, variables: merged };
      }
    }
  }
  return updates;
}
