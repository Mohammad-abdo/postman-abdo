"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.assertWorkspaceMember = assertWorkspaceMember;
exports.assertWorkspaceAdmin = assertWorkspaceAdmin;
const prisma_1 = require("../../core/database/prisma");
const http_error_1 = require("../../core/errors/http-error");
/** Throws 404 unless the user belongs to the workspace; returns the membership. */
async function assertWorkspaceMember(userId, workspaceId) {
    const member = await prisma_1.prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!member)
        throw (0, http_error_1.NotFound)('Workspace not found');
    return member;
}
async function assertWorkspaceAdmin(userId, workspaceId) {
    const member = await assertWorkspaceMember(userId, workspaceId);
    if (member.role !== 'admin')
        throw (0, http_error_1.Forbidden)('Only workspace admins can do this');
    return member;
}
