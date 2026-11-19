"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.adminFilesService = void 0;
const promises_1 = __importDefault(require("fs/promises"));
const path_1 = __importDefault(require("path"));
const env_1 = require("../../../config/env");
const prisma_1 = require("../../../core/database/prisma");
const http_error_1 = require("../../../core/errors/http-error");
exports.adminFilesService = {
    async list(query) {
        const where = {
            ...(query.userId ? { userId: query.userId } : {}),
            ...(query.q ? { originalName: { contains: query.q } } : {}),
        };
        const orderBy = query.sort === 'size' ? { size: query.order } : { createdAt: query.order };
        const [total, sum, items] = await Promise.all([
            prisma_1.prisma.uploadedFile.count({ where }),
            prisma_1.prisma.uploadedFile.aggregate({ where, _sum: { size: true } }),
            prisma_1.prisma.uploadedFile.findMany({
                where,
                include: { user: { select: { id: true, name: true, email: true } } },
                orderBy,
                skip: (query.page - 1) * query.pageSize,
                take: query.pageSize,
            }),
        ]);
        return { total, totalBytes: sum._sum.size || 0, page: query.page, pageSize: query.pageSize, items };
    },
    async remove(id) {
        const file = await prisma_1.prisma.uploadedFile.findUnique({ where: { id } });
        if (!file)
            throw (0, http_error_1.NotFound)('File not found');
        await promises_1.default.rm(path_1.default.join(env_1.env.uploadDir, path_1.default.basename(file.storedName)), { force: true });
        await prisma_1.prisma.uploadedFile.delete({ where: { id } });
        return file;
    },
};
