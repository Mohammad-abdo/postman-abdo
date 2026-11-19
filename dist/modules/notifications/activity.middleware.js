"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.activityTracker = activityTracker;
const cache_service_1 = require("../../core/cache/cache.service");
const prisma_1 = require("../../core/database/prisma");
const notification_service_1 = require("./notification.service");
const RESOURCES = {
    collections: 'collection',
    folders: 'folder',
    requests: 'request',
    examples: 'example',
    environments: 'environment',
    mocks: 'mock',
    monitors: 'monitor',
    projects: 'project',
};
const LABELS = {
    collection: 'collection',
    folder: 'folder',
    request: 'request',
    example: 'example',
    environment: 'environment',
    mock: 'mock server',
    monitor: 'monitor',
    project: 'project',
};
const ACTION_VERBS = {
    duplicate: 'duplicated',
    move: 'moved',
    restore: 'restored',
    position: 'reordered',
    run: 'ran',
    permanent: 'permanently deleted',
};
async function resolveById(kind, id) {
    switch (kind) {
        case 'collection': {
            const c = await prisma_1.prisma.collection.findUnique({ where: { id }, select: { name: true, workspaceId: true, projectId: true } });
            return c && { workspaceId: c.workspaceId, projectId: c.projectId, name: c.name, link: { kind, id, workspaceId: c.workspaceId } };
        }
        case 'folder': {
            const f = await prisma_1.prisma.folder.findUnique({ where: { id }, select: { name: true, collection: { select: { workspaceId: true, projectId: true } } } });
            return f && { workspaceId: f.collection.workspaceId, projectId: f.collection.projectId, name: f.name, link: { kind, id, workspaceId: f.collection.workspaceId } };
        }
        case 'request': {
            const r = await prisma_1.prisma.request.findUnique({ where: { id }, select: { name: true, collection: { select: { workspaceId: true, projectId: true } } } });
            return r && { workspaceId: r.collection.workspaceId, projectId: r.collection.projectId, name: r.name, link: { kind, id, workspaceId: r.collection.workspaceId } };
        }
        case 'example': {
            const e = await prisma_1.prisma.example.findUnique({ where: { id }, select: { name: true, parent: { select: { collection: { select: { workspaceId: true } } } } } });
            return e && { workspaceId: e.parent.collection.workspaceId, name: e.name, link: { kind: 'request', workspaceId: e.parent.collection.workspaceId } };
        }
        case 'environment': {
            const e = await prisma_1.prisma.environment.findUnique({ where: { id }, select: { name: true, workspaceId: true, projectId: true } });
            return e && { workspaceId: e.workspaceId, projectId: e.projectId, name: e.name, link: { kind, id, workspaceId: e.workspaceId } };
        }
        case 'mock': {
            const m = await prisma_1.prisma.mockServer.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
            return m && { workspaceId: m.workspaceId, name: m.name, link: { kind, id, workspaceId: m.workspaceId } };
        }
        case 'monitor': {
            const m = await prisma_1.prisma.monitor.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
            return m && { workspaceId: m.workspaceId, name: m.name, link: { kind, id, workspaceId: m.workspaceId } };
        }
        case 'project': {
            const p = await prisma_1.prisma.project.findUnique({ where: { id }, select: { name: true, workspaceId: true } });
            return p && { workspaceId: p.workspaceId, projectId: id, name: p.name, link: { kind, id, workspaceId: p.workspaceId } };
        }
    }
}
/** For creations: find the workspace from the request body. */
async function resolveFromBody(body) {
    if (body?.workspaceId)
        return body.workspaceId;
    if (body?.collectionId)
        return (await prisma_1.prisma.collection.findUnique({ where: { id: body.collectionId }, select: { workspaceId: true } }))?.workspaceId || null;
    if (body?.requestId) {
        const r = await prisma_1.prisma.request.findUnique({ where: { id: body.requestId }, select: { collection: { select: { workspaceId: true } } } });
        return r?.collection.workspaceId || null;
    }
    return null;
}
/** A freshly created entity: describe it from the response (examples link to their request's workspace). */
async function targetFromCreation(kind, body, response) {
    const workspaceId = response?.workspaceId || (await resolveFromBody(body));
    if (!workspaceId)
        return null;
    const link = kind === 'example' ? { kind: 'workspace', workspaceId } : { kind, id: response?.id, workspaceId };
    return { workspaceId, projectId: response?.projectId, name: response?.name || body?.name, link };
}
const userName = (userId) => cache_service_1.cache.wrap(`user-name:${userId}`, 300, async () => (await prisma_1.prisma.user.findUnique({ where: { id: userId }, select: { name: true } }))?.name || 'Someone');
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
/** What an import added, from the import endpoints' responses (single import or one entry per uploaded file). */
function describeImport(response) {
    const results = Array.isArray(response) ? response : [response];
    const collections = results.filter((r) => r?.kind === 'collection' && r.collection);
    const environments = results.filter((r) => r?.kind === 'environment');
    const dumpCollections = results.reduce((n, r) => n + (r?.kind === 'dump' ? r.collections || 0 : 0), 0);
    const total = collections.length + dumpCollections;
    if (total === 1 && !environments.length && collections.length === 1) {
        const { id, name } = collections[0].collection;
        return { id, name, title: (actor) => `${actor} imported collection “${name}”` };
    }
    if (total)
        return { title: (actor) => `${actor} imported ${plural(total, 'collection')}` };
    if (environments.length)
        return { title: (actor) => `${actor} imported ${plural(environments.length, 'environment')}` };
    return null;
}
/** Imports (pasted text, URLs, uploaded files) create collections, so the team hears about them like any creation. */
function trackImport(req, res, next) {
    if (req.method !== 'POST')
        return next();
    let responseBody;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        responseBody = body;
        return originalJson(body);
    };
    res.on('finish', async () => {
        if (res.statusCode >= 300 || res.getHeader('Idempotent-Replay'))
            return;
        try {
            // Read at the end: multipart bodies are only parsed by the route's own middleware, after this one ran.
            const workspaceId = String(req.body?.workspaceId || '');
            const imported = workspaceId ? describeImport(responseBody) : null;
            if (!imported)
                return;
            const actorName = await userName(req.userId);
            await notification_service_1.notificationService.workspaceEvent(workspaceId, {
                type: 'collection.imported',
                title: imported.title(actorName),
                actor: { id: req.userId, name: actorName },
                link: imported.id ? { kind: 'collection', id: imported.id, workspaceId } : { kind: 'workspace', workspaceId },
            }, [], 'members');
        }
        catch (e) {
            console.error('import notification failed', e);
        }
    });
    next();
}
function activityTracker(req, res, next) {
    if (req.method === 'GET' || !req.userId)
        return next();
    const [resource, id, action] = req.path.split('/').filter(Boolean);
    if (resource === 'transfer' && id === 'import')
        return trackImport(req, res, next);
    const kind = RESOURCES[resource];
    // Member changes have their own, more specific notifications.
    if (!kind || action === 'members' || id === 'trash')
        return next();
    // Project creation/deletion and membership have dedicated notifications (workspace-event.notifier).
    if (kind === 'project' && (!id || req.method === 'DELETE' || action))
        return next();
    const hasId = !!id;
    const pending = (hasId ? resolveById(kind, id) : Promise.resolve(null)).catch(() => null);
    let responseBody;
    const originalJson = res.json.bind(res);
    res.json = (body) => {
        responseBody = body;
        return originalJson(body);
    };
    res.on('finish', async () => {
        if (res.statusCode >= 300 || res.getHeader('Idempotent-Replay'))
            return;
        try {
            const target = (await pending) || (await targetFromCreation(kind, req.body, responseBody));
            if (!target)
                return;
            const verb = (action && ACTION_VERBS[action]) || (req.method === 'DELETE' ? 'deleted' : hasId ? 'updated' : 'created');
            const actorName = await userName(req.userId);
            await notification_service_1.notificationService.workspaceEvent(target.workspaceId, {
                type: `${kind}.${verb.replace(/\s+/g, '_')}`,
                title: `${actorName} ${verb} ${LABELS[kind]}${target.name ? ` “${target.name}”` : ''}`,
                projectId: target.projectId,
                actor: { id: req.userId, name: actorName },
                link: verb.includes('deleted') ? { kind: 'workspace', workspaceId: target.workspaceId } : target.link,
            }, [], 
            // Something new appeared: the whole team (or project) should notice, not only the workspace owner.
            verb === 'created' ? 'members' : 'owner');
        }
        catch (e) {
            console.error('activity notification failed', e);
        }
    });
    next();
}
