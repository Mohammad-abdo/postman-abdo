import fs from 'fs/promises';
import path from 'path';
import { Prisma } from '@prisma/client';
import { env } from '../../../config/env';
import { prisma } from '../../../core/database/prisma';
import { NotFound } from '../../../core/errors/http-error';
import { FileQuery } from '../admin.schema';

export const adminFilesService = {
  async list(query: FileQuery) {
    const where: Prisma.UploadedFileWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.q ? { originalName: { contains: query.q } } : {}),
    };
    const orderBy = query.sort === 'size' ? { size: query.order } : { createdAt: query.order };
    const [total, sum, items] = await Promise.all([
      prisma.uploadedFile.count({ where }),
      prisma.uploadedFile.aggregate({ where, _sum: { size: true } }),
      prisma.uploadedFile.findMany({
        where,
        include: { user: { select: { id: true, name: true, email: true } } },
        orderBy,
        skip: (query.page - 1) * query.pageSize,
        take: query.pageSize,
      }),
    ]);
    return { total, totalBytes: sum._sum.size || 0, page: query.page, pageSize: query.pageSize, items };
  },

  async remove(id: string) {
    const file = await prisma.uploadedFile.findUnique({ where: { id } });
    if (!file) throw NotFound('File not found');
    await fs.rm(path.join(env.uploadDir, path.basename(file.storedName)), { force: true });
    await prisma.uploadedFile.delete({ where: { id } });
    return file;
  },
};
