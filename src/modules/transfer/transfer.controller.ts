import { Request, Response } from 'express';
import { currentUserId } from '../../core/middleware/auth.middleware';
import { BadRequest } from '../../core/errors/http-error';
import { prisma } from '../../core/database/prisma';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { collectionService } from '../collections/collection.service';
import { environmentService } from '../environments/environment.service';
import { NotFound } from '../../core/errors/http-error';
import { buildOpenApi } from './openapi.exporter';
import { parseCurl } from './curl.parser';
import { transferService } from './transfer.service';

export const transferController = {
  importText: async (req: Request, res: Response) => {
    const { workspaceId, text, url } = req.body;
    await assertWorkspaceMember(currentUserId(req), workspaceId);
    const content = url ? await transferService.fetchText(url) : text;
    res.json(await transferService.importText(workspaceId, content));
  },

  importFiles: async (req: Request, res: Response) => {
    const workspaceId = String(req.body.workspaceId || '');
    if (!workspaceId) throw BadRequest('workspaceId is required');
    await assertWorkspaceMember(currentUserId(req), workspaceId);
    const results: Record<string, unknown>[] = [];
    for (const file of (req.files as Express.Multer.File[]) || []) {
      try {
        results.push({ file: file.originalname, ...(await transferService.importText(workspaceId, file.buffer.toString('utf8'), file.originalname)) });
      } catch (e) {
        results.push({ file: file.originalname, error: (e as Error).message });
      }
    }
    res.json(results);
  },

  parseCurl: (req: Request, res: Response) => res.json(parseCurl(req.body.text)),

  /** A Postman-style data dump of the whole workspace. */
  /** OpenAPI 3 document built from a collection's saved requests and examples. */
  exportOpenApi: async (req: Request, res: Response) => {
    const collection = await prisma.collection.findFirst({ where: { id: req.params.collectionId, deletedAt: null } });
    if (!collection) throw NotFound('Collection not found');
    await assertWorkspaceMember(currentUserId(req), collection.workspaceId);
    const [requests, folders] = await Promise.all([
      prisma.request.findMany({ where: { collectionId: collection.id, type: 'http' }, orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }], include: { examples: { orderBy: { sortOrder: 'asc' } } } }),
      prisma.folder.findMany({ where: { collectionId: collection.id }, select: { id: true, name: true } }),
    ]);
    res.setHeader('Content-Disposition', `attachment; filename="${collection.name.replace(/[^A-Za-z0-9_-]+/g, '_')}.openapi.json"`);
    res.json(buildOpenApi(collection, requests as never, folders));
  },

  exportWorkspace: async (req: Request, res: Response) => {
    const workspaceId = req.params.workspaceId;
    await assertWorkspaceMember(currentUserId(req), workspaceId);
    const collections = await prisma.collection.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true } });
    const environments = await prisma.environment.findMany({ where: { workspaceId } });
    res.setHeader('Content-Disposition', 'attachment; filename="workspace_dump.json"');
    res.json({
      version: 1,
      collections: await Promise.all(collections.map((c) => collectionService.toPostman(c.id))),
      environments: environments.filter((e) => !e.isGlobal).map(environmentService.toPostman),
      globals: environments.filter((e) => e.isGlobal).map(environmentService.toPostman)[0] || null,
    });
  },
};
