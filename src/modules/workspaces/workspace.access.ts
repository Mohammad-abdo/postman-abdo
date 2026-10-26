import { prisma } from '../../core/database/prisma';
import { Forbidden, NotFound } from '../../core/errors/http-error';

/** Throws 404 unless the user belongs to the workspace; returns the membership. */
export async function assertWorkspaceMember(userId: string, workspaceId: string) {
  const member = await prisma.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw NotFound('Workspace not found');
  return member;
}

export async function assertWorkspaceAdmin(userId: string, workspaceId: string) {
  const member = await assertWorkspaceMember(userId, workspaceId);
  if (member.role !== 'admin') throw Forbidden('Only workspace admins can do this');
  return member;
}
