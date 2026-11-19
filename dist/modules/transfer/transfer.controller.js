"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.transferController = void 0;
const auth_middleware_1 = require("../../core/middleware/auth.middleware");
const http_error_1 = require("../../core/errors/http-error");
const prisma_1 = require("../../core/database/prisma");
const workspace_access_1 = require("../workspaces/workspace.access");
const collection_service_1 = require("../collections/collection.service");
const environment_service_1 = require("../environments/environment.service");
const curl_parser_1 = require("./curl.parser");
const transfer_service_1 = require("./transfer.service");
exports.transferController = {
    importText: async (req, res) => {
        const { workspaceId, text, url } = req.body;
        await (0, workspace_access_1.assertWorkspaceMember)((0, auth_middleware_1.currentUserId)(req), workspaceId);
        const content = url ? await transfer_service_1.transferService.fetchText(url) : text;
        res.json(await transfer_service_1.transferService.importText(workspaceId, content));
    },
    importFiles: async (req, res) => {
        const workspaceId = String(req.body.workspaceId || '');
        if (!workspaceId)
            throw (0, http_error_1.BadRequest)('workspaceId is required');
        await (0, workspace_access_1.assertWorkspaceMember)((0, auth_middleware_1.currentUserId)(req), workspaceId);
        const results = [];
        for (const file of req.files || []) {
            try {
                results.push({ file: file.originalname, ...(await transfer_service_1.transferService.importText(workspaceId, file.buffer.toString('utf8'), file.originalname)) });
            }
            catch (e) {
                results.push({ file: file.originalname, error: e.message });
            }
        }
        res.json(results);
    },
    parseCurl: (req, res) => res.json((0, curl_parser_1.parseCurl)(req.body.text)),
    /** A Postman-style data dump of the whole workspace. */
    exportWorkspace: async (req, res) => {
        const workspaceId = req.params.workspaceId;
        await (0, workspace_access_1.assertWorkspaceMember)((0, auth_middleware_1.currentUserId)(req), workspaceId);
        const collections = await prisma_1.prisma.collection.findMany({ where: { workspaceId, deletedAt: null }, select: { id: true } });
        const environments = await prisma_1.prisma.environment.findMany({ where: { workspaceId } });
        res.setHeader('Content-Disposition', 'attachment; filename="workspace_dump.json"');
        res.json({
            version: 1,
            collections: await Promise.all(collections.map((c) => collection_service_1.collectionService.toPostman(c.id))),
            environments: environments.filter((e) => !e.isGlobal).map(environment_service_1.environmentService.toPostman),
            globals: environments.filter((e) => e.isGlobal).map(environment_service_1.environmentService.toPostman)[0] || null,
        });
    },
};
