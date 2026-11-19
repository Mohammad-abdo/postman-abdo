"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertCollectionAccess = assertCollectionAccess;
exports.assertFolderAccess = assertFolderAccess;
exports.assertRequestAccess = assertRequestAccess;
exports.assertExampleAccess = assertExampleAccess;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
const workspace_access_1 = require("../workspaces/workspace.access");
/** Ownership guards for everything that lives inside a collection. */
async function assertCollectionAccess(userId, collectionId) {
    const collection = await prisma_1.prisma.collection.findUnique({ where: { id: collectionId } });
    if (!collection)
        throw (0, http_error_1.NotFound)('Collection not found');
    await (0, workspace_access_1.assertWorkspaceMember)(userId, collection.workspaceId);
    return collection;
}
async function assertFolderAccess(userId, folderId) {
    const folder = await prisma_1.prisma.folder.findUnique({ where: { id: folderId } });
    if (!folder)
        throw (0, http_error_1.NotFound)('Folder not found');
    await assertCollectionAccess(userId, folder.collectionId);
    return folder;
}
async function assertRequestAccess(userId, requestId) {
    const request = await prisma_1.prisma.request.findUnique({ where: { id: requestId } });
    if (!request)
        throw (0, http_error_1.NotFound)('Request not found');
    await assertCollectionAccess(userId, request.collectionId);
    return request;
}
async function assertExampleAccess(userId, exampleId) {
    const example = await prisma_1.prisma.example.findUnique({ where: { id: exampleId } });
    if (!example)
        throw (0, http_error_1.NotFound)('Example not found');
    await assertRequestAccess(userId, example.requestId);
    return example;
}
