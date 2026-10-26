import { Prisma } from '@prisma/client';
import { prisma, json } from '../../core/database/prisma';
import { assertExampleAccess, assertRequestAccess } from '../collections/collection.access';
import { CreateExampleInput, UpdateExampleInput } from './example.schema';

export const exampleService = {
  /** A new example snapshots the parent request unless one is supplied (e.g. "Save as example"). */
  async create(userId: string, input: CreateExampleInput) {
    const parent = await assertRequestAccess(userId, input.requestId);
    const count = await prisma.example.count({ where: { requestId: parent.id } });
    return prisma.example.create({
      data: {
        requestId: parent.id,
        name: input.name || parent.name,
        request: json(input.request || {
          method: parent.method,
          url: parent.url,
          params: parent.params,
          pathVariables: parent.pathVariables,
          headers: parent.headers,
          body: parent.body,
        }),
        code: input.code ?? 200,
        status: input.status || 'OK',
        headers: json(input.headers || []),
        body: input.body || '',
        language: input.language || 'json',
        sortOrder: count,
      },
    });
  },

  get: (userId: string, id: string) => assertExampleAccess(userId, id),

  async update(userId: string, id: string, input: UpdateExampleInput) {
    await assertExampleAccess(userId, id);
    return prisma.example.update({ where: { id }, data: input as Prisma.ExampleUpdateInput });
  },

  async remove(userId: string, id: string) {
    await assertExampleAccess(userId, id);
    await prisma.example.delete({ where: { id } });
  },

  async duplicate(userId: string, id: string) {
    const { id: _id, createdAt: _c, updatedAt: _u, ...example } = await assertExampleAccess(userId, id);
    return prisma.example.create({
      data: { ...(example as Prisma.ExampleUncheckedCreateInput), name: `${example.name} Copy`, sortOrder: example.sortOrder + 1 },
    });
  },
};
