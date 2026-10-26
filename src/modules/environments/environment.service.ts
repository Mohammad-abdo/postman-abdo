import { Environment, Prisma } from '@prisma/client';
import { prisma, json } from '../../core/database/prisma';
import { BadRequest, NotFound } from '../../core/errors/http-error';
import { Variable } from '../../shared/postman/types';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { CreateEnvironmentInput, UpdateEnvironmentInput } from './environment.schema';

async function assertEnvironmentAccess(userId: string, id: string) {
  const environment = await prisma.environment.findUnique({ where: { id } });
  if (!environment) throw NotFound('Environment not found');
  await assertWorkspaceMember(userId, environment.workspaceId);
  return environment;
}

export const environmentService = {
  async list(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    await this.globals(workspaceId);
    return prisma.environment.findMany({ where: { workspaceId }, orderBy: [{ isGlobal: 'desc' }, { createdAt: 'asc' }] });
  },

  /** The workspace's Globals scope, created on demand. */
  async globals(workspaceId: string) {
    const existing = await prisma.environment.findFirst({ where: { workspaceId, isGlobal: true } });
    return existing || prisma.environment.create({ data: { workspaceId, name: 'Globals', isGlobal: true, variables: [] } });
  },

  async create(userId: string, input: CreateEnvironmentInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    return prisma.environment.create({ data: { ...input, variables: json(input.variables) } });
  },

  async update(userId: string, id: string, input: UpdateEnvironmentInput) {
    await assertEnvironmentAccess(userId, id);
    return prisma.environment.update({ where: { id }, data: input as Prisma.EnvironmentUpdateInput });
  },

  async remove(userId: string, id: string) {
    const environment = await assertEnvironmentAccess(userId, id);
    if (environment.isGlobal) throw BadRequest('Globals cannot be deleted');
    await prisma.environment.delete({ where: { id } });
  },

  async duplicate(userId: string, id: string) {
    const environment = await assertEnvironmentAccess(userId, id);
    return prisma.environment.create({
      data: { workspaceId: environment.workspaceId, name: `${environment.name} Copy`, variables: json(environment.variables) },
    });
  },

  async export(userId: string, id: string) {
    return this.toPostman(await assertEnvironmentAccess(userId, id));
  },

  /** Postman environment/globals file format (initial values only, like Postman exports). */
  toPostman(environment: Environment) {
    return {
      id: environment.id,
      name: environment.name,
      values: ((environment.variables as unknown as Variable[]) || []).map((v) => ({
        key: v.key,
        value: v.value ?? '',
        type: v.type === 'secret' ? 'secret' : 'default',
        enabled: v.enabled !== false,
      })),
      _postman_variable_scope: environment.isGlobal ? 'globals' : 'environment',
      _postman_exported_at: new Date().toISOString(),
      _postman_exported_using: 'Fack Postman',
    };
  },
};
