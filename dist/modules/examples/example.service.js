"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.exampleService = void 0;
const prisma_1 = require("../../core/database/prisma");
const collection_access_1 = require("../collections/collection.access");
exports.exampleService = {
    /** A new example snapshots the parent request unless one is supplied (e.g. "Save as example"). */
    async create(userId, input) {
        const parent = await (0, collection_access_1.assertRequestAccess)(userId, input.requestId);
        if (input.id) {
            const existing = await prisma_1.prisma.example.findUnique({ where: { id: input.id } });
            if (existing)
                return existing;
        }
        const count = await prisma_1.prisma.example.count({ where: { requestId: parent.id } });
        return prisma_1.prisma.example.create({
            data: {
                ...(input.id ? { id: input.id } : {}),
                requestId: parent.id,
                name: input.name || parent.name,
                request: (0, prisma_1.json)(input.request || {
                    method: parent.method,
                    url: parent.url,
                    params: parent.params,
                    pathVariables: parent.pathVariables,
                    headers: parent.headers,
                    body: parent.body,
                }),
                code: input.code ?? 200,
                status: input.status || 'OK',
                headers: (0, prisma_1.json)(input.headers || []),
                body: input.body || '',
                language: input.language || 'json',
                sortOrder: count,
            },
        });
    },
    get: (userId, id) => (0, collection_access_1.assertExampleAccess)(userId, id),
    async update(userId, id, input) {
        await (0, collection_access_1.assertExampleAccess)(userId, id);
        return prisma_1.prisma.example.update({ where: { id }, data: input });
    },
    async remove(userId, id) {
        await (0, collection_access_1.assertExampleAccess)(userId, id);
        await prisma_1.prisma.example.delete({ where: { id } });
    },
    async duplicate(userId, id) {
        const { id: _id, createdAt: _c, updatedAt: _u, ...example } = await (0, collection_access_1.assertExampleAccess)(userId, id);
        return prisma_1.prisma.example.create({
            data: { ...example, name: `${example.name} Copy`, sortOrder: example.sortOrder + 1 },
        });
    },
};
