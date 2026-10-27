import { NextFunction, Request, Response } from 'express';
import { cache } from '../../core/cache/cache.service';
import { prisma } from '../../core/database/prisma';
import { notificationService } from './notification.service';
import { NotificationLink } from './notification.types';

/**
 * Turns successful writes into team-activity notifications for the workspace owner
 * ("Sara updated request “Login” in Payments API"), without every module having to call the notifier.
 * The target is resolved *before* the handler runs so deletions can still be described.
 */

interface Target {
  workspaceId: string;
  projectId?: string | null;
  name?: string;
  link: NotificationLink;
}

type Kind = 'collection' | 'folder' | 'request' | 'example' | 'environment' | 'mock' | 'monitor' | 'project';

const RESOURCES: Record<string, Kind> = {
  collections: 'collection',
  folders: 'folder',
  requests: 'request',
  examples: 'example',
  environments: 'environment',
  mocks: 'mock',
  monitors: 'monitor',
  projects: 'project',
};

const LABELS: Record<Kind, string> = {
  collection: 'collection',
  folder: 'folder',
  request: 'request',
  example: 'example',
  environment: 'environment',
  mock: 'mock server',
  monitor: 'monitor',
  project: 'project',
};

const ACTION_VERBS: Record<string, string> = {
  duplicate: 'duplicated',
  move: 'moved',
  restore: 'restored',
  position: 'reordered',
  run: 'ran',
  permanent: 'permanently deleted',
};

async function resolveById(kind: Kind, id: string): Promise<Target | null> {
  switch (kind) {
    case 'collection': {
      const c = await prisma.collection.findUnique({ where: { id }, select: { name: true, workspaceId: true, projectId: true } });
      return c && { workspaceId: c.workspaceId, projectId: c.projectId, name: c.name, link: { kind, id, workspaceId: c.workspaceId } };
    }
    case 'folder': {
      const f = await prisma.folder.findUnique({ where: { id }, select: { name: true, collection: { select: { workspaceId: true, projectId: true } } } });
      return f && { workspaceId: f.collection.workspaceId, projectId: f.collection.projectId, name: f.name, link: { kind, id, workspaceId: f.collection.workspaceId } };
    }
    case 'request': {
      const r = await prisma.request.findUnique({ where: { id }, select: { name: true, collection: { select: { workspaceId: true, projectId: true } } } });
      return r && { workspaceId: r.collection.workspaceId, projectId: r.collection.projectId, name: r.name, link: { kind, id, workspaceId: r.collection.workspaceId } };
    }
    case 'example': {
      const e = await prisma.example.findUnique({ where: { id }, select: { name: true, parent: { select: { collection: { select: { workspaceId: true } } } } } });
      return e && { workspaceId: e.parent.collection.workspaceId, name: e.name, link: { kind: 'request', workspaceId: e.parent.collection.workspaceId } };
    }
    case 'environment': {
      const e = await prisma.environment.findUnique({ where: { id }, select: { name: true, workspaceId: true, projectId: true } });
      return e && { workspaceId: e.workspaceId, projectId: e.projectId, name: e.name, link: { kind, id, workspaceId: e.workspaceId } };
    }
    case 'mock': {
      const m = await prisma.mockServer.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
      return m && { workspaceId: m.workspaceId, name: m.name, link: { kind, id, workspaceId: m.workspaceId } };
    }
    case 'monitor': {
      const m = await prisma.monitor.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
      return m && { workspaceId: m.workspaceId, name: m.name, link: { kind, id, workspaceId: m.workspaceId } };
    }
    case 'project': {
      const p = await prisma.project.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
      return p && { workspaceId: p.workspaceId, projectId: id, name: p.name, link: { kind, id, workspaceId: p.workspaceId } };
    }
  }
}

/** For creations: find the workspace from the request body. */
async function resolveFromBody(body: any): Promise<string | null> {
  if (body?.workspaceId) return body.workspaceId;
  if (body?.collectionId) return (await prisma.collection.findUnique({ where: { id: body.collectionId }, select: { workspaceId: true } }))?.workspaceId || null;
  if (body?.requestId) {
    const r = await prisma.request.findUnique({ where: { id: body.requestId }, select: { collection: { select: { workspaceId: true } } } });
    return r?.collection.workspaceId || null;
  }
  return null;
}

/** A freshly created entity: describe it from the response (examples link to their request's workspace). */
async function targetFromCreation(kind: Kind, body: any, response: any): Promise<Target | null> {
  const workspaceId = response?.workspaceId || (await resolveFromBody(body));
  if (!workspaceId) return null;
  const link: NotificationLink = kind === 'example' ? { kind: 'workspace', workspaceId } : { kind, id: response?.id, workspaceId };
  return { workspaceId, projectId: response?.projectId, name: response?.name || body?.name, link };
}

const userName = (userId: string) =>
  cache.wrap(`user-name:${userId}`, 300, async () => (await prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || 'Someone');

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** What an import added, from the import endpoints' responses (single import or one entry per uploaded file). */
function describeImport(response: any): { name?: string; id?: string; title: (actor: string) => string } | null {
  const results: any[] = Array.isArray(response) ? response : [response];
  const collections = results.filter((r) => r?.kind === 'collection' && r.collection);
  const environments = results.filter((r) => r?.kind === 'environment');
  const dumpCollections = results.reduce((n, r) => n + (r?.kind === 'dump' ? r.collections || 0 : 0), 0);
  const total = collections.length + dumpCollections;
  if (total === 1 && !environments.length && collections.length === 1) {
    const { id, name } = collections[0].collection;
    return { id, name, title: (actor) => `${actor} imported collection “${name}”` };
  }
  if (total) return { title: (actor) => `${actor} imported ${plural(total, 'collection')}` };
  if (environments.length) return { title: (actor) => `${actor} imported ${plural(environments.length, 'environment')}` };
  return null;
}

/** Imports (pasted text, URLs, uploaded files) create collections, so the team hears about them like any creation. */
function trackImport(req: Request, res: Response, next: NextFunction) {
  if (req.method !== 'POST') return next();
  let responseBody: any;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };
  res.on('finish', async () => {
    if (res.statusCode >= 300 || res.getHeader('Idempotent-Replay')) return;
    try {
      // Read at the end: multipart bodies are only parsed by the route's own middleware, after this one ran.
      const workspaceId = String(req.body?.workspaceId || '');
      const imported = workspaceId ? describeImport(responseBody) : null;
      if (!imported) return;
      const actorName = await userName(req.userId!);
      await notificationService.workspaceEvent(
        workspaceId,
        {
          type: 'collection.imported',
          title: imported.title(actorName),
          actor: { id: req.userId!, name: actorName },
          link: imported.id ? { kind: 'collection', id: imported.id, workspaceId } : { kind: 'workspace', workspaceId },
        },
        [],
        'members',
      );
    } catch (e) {
      console.error('import notification failed', e);
    }
  });
  next();
}

export function activityTracker(req: Request, res: Response, next: NextFunction) {
  if (req.method === 'GET' || !req.userId) return next();
  const [resource, id, action] = req.path.split('/').filter(Boolean);
  if (resource === 'transfer' && id === 'import') return trackImport(req, res, next);
  const kind = RESOURCES[resource];
  // Member changes have their own, more specific notifications.
  if (!kind || action === 'members' || id === 'trash') return next();
  // Project creation/deletion and membership have dedicated notifications (workspace-event.notifier).
  if (kind === 'project' && (!id || req.method === 'DELETE' || action)) return next();

  const hasId = !!id;
  const pending = (hasId ? resolveById(kind, id) : Promise.resolve(null)).catch(() => null);
  let responseBody: any;
  const originalJson = res.json.bind(res);
  res.json = (body: unknown) => {
    responseBody = body;
    return originalJson(body);
  };

  res.on('finish', async () => {
    if (res.statusCode >= 300 || res.getHeader('Idempotent-Replay')) return;
    try {
      const target = (await pending) || (await targetFromCreation(kind, req.body, responseBody));
      if (!target) return;
      const verb = (action && ACTION_VERBS[action]) || (req.method === 'DELETE' ? 'deleted' : hasId ? 'updated' : 'created');
      const actorName = await userName(req.userId!);
      await notificationService.workspaceEvent(
        target.workspaceId,
        {
          type: `${kind}.${verb.replace(/\s+/g, '_')}`,
          title: `${actorName} ${verb} ${LABELS[kind]}${target.name ? ` “${target.name}”` : ''}`,
          projectId: target.projectId,
          actor: { id: req.userId!, name: actorName },
          link: verb.includes('deleted') ? { kind: 'workspace', workspaceId: target.workspaceId } : target.link,
        },
        [],
        // Something new appeared: the whole team (or project) should notice, not only the workspace owner.
        verb === 'created' ? 'members' : 'owner',
      );
    } catch (e) {
      console.error('activity notification failed', e);
    }
  });
  next();
}
