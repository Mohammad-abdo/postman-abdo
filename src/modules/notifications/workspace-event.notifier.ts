import { prisma } from '../../core/database/prisma';
import { realtime } from '../realtime/realtime.hub';
import { WorkspaceEvent } from '../workspaces/workspace.events';
import { notificationService } from './notification.service';
import { NotifyInput } from './notification.types';

type Message = Pick<NotifyInput, 'type' | 'title' | 'body'>;

interface Context {
  actor: string;
  workspace: string;
  project: string;
  role: string;
  targets: string;
}

/** What the affected user(s) and the workspace owner read for each membership change. */
const MESSAGES: Record<WorkspaceEvent['type'], { target?: (c: Context) => Message; owner: (c: Context) => Message }> = {
  'workspace.member_added': {
    target: (c) => ({ type: 'workspace.member_added', title: `${c.actor} added you to “${c.workspace}”`, body: `You joined as ${c.role}.` }),
    owner: (c) => ({ type: 'workspace.member_added', title: `${c.actor} added ${c.targets} to “${c.workspace}”` }),
  },
  'workspace.member_role_changed': {
    target: (c) => ({ type: 'workspace.role_changed', title: `Your role in “${c.workspace}” is now ${c.role}`, body: `Changed by ${c.actor}.` }),
    owner: (c) => ({ type: 'workspace.role_changed', title: `${c.actor} made ${c.targets} ${c.role} in “${c.workspace}”` }),
  },
  'workspace.member_removed': {
    target: (c) => ({ type: 'workspace.member_removed', title: `${c.actor} removed you from “${c.workspace}”` }),
    owner: (c) => ({ type: 'workspace.member_removed', title: `${c.actor} removed ${c.targets} from “${c.workspace}”` }),
  },
  'workspace.member_left': {
    owner: (c) => ({ type: 'workspace.member_left', title: `${c.targets} left “${c.workspace}”` }),
  },
  'project.created': {
    target: (c) => ({ type: 'project.invited', title: `${c.actor} invited you to project “${c.project}”`, body: `In workspace “${c.workspace}”.` }),
    owner: (c) => ({ type: 'project.created', title: `${c.actor} created project “${c.project}”` }),
  },
  'project.deleted': {
    target: (c) => ({ type: 'project.deleted', title: `${c.actor} deleted project “${c.project}”` }),
    owner: (c) => ({ type: 'project.deleted', title: `${c.actor} deleted project “${c.project}”` }),
  },
  'project.member_added': {
    target: (c) => ({ type: 'project.invited', title: `${c.actor} added you to project “${c.project}”`, body: `You can now work on its collections and environments.` }),
    owner: (c) => ({ type: 'project.member_added', title: `${c.actor} added ${c.targets} to project “${c.project}”` }),
  },
  'project.member_role_changed': {
    target: (c) => ({ type: 'project.role_changed', title: `Your role in project “${c.project}” is now ${c.role}` }),
    owner: (c) => ({ type: 'project.role_changed', title: `${c.actor} made ${c.targets} ${c.role} in project “${c.project}”` }),
  },
  'project.member_removed': {
    target: (c) => ({ type: 'project.member_removed', title: `${c.actor} removed you from project “${c.project}”` }),
    owner: (c) => ({ type: 'project.member_removed', title: `${c.actor} removed ${c.targets} from project “${c.project}”` }),
  },
  'project.member_left': {
    owner: (c) => ({ type: 'project.member_left', title: `${c.targets} left project “${c.project}”` }),
  },
};

function describeTargets(names: string[]) {
  if (names.length <= 2) return names.join(' and ') || 'a member';
  return `${names.slice(0, 2).join(', ')} and ${names.length - 2} more`;
}

/** Notifies everyone affected by a membership change and tells their open clients to refresh. */
export async function notifyWorkspaceEvent(event: WorkspaceEvent | null) {
  if (!event) return;
  try {
    const [actor, workspace, targets] = await Promise.all([
      prisma.user.findUnique({ where: { id: event.actorId }, select: { name: true } }),
      prisma.workspace.findUnique({ where: { id: event.workspaceId }, select: { name: true, ownerId: true } }),
      prisma.user.findMany({ where: { id: { in: event.targetUserIds } }, select: { id: true, name: true } }),
    ]);
    if (!workspace) return;
    const context: Context = {
      actor: actor?.name || 'Someone',
      workspace: workspace.name,
      project: event.projectName || 'a project',
      role: event.role || 'member',
      targets: describeTargets(targets.map((t) => t.name)),
    };
    const messages = MESSAGES[event.type];
    const link = event.projectId
      ? { kind: 'project' as const, id: event.projectId, workspaceId: event.workspaceId }
      : { kind: 'workspace' as const, workspaceId: event.workspaceId };
    const base = { workspaceId: event.workspaceId, projectId: event.projectId, actor: { id: event.actorId, name: actor?.name }, link };

    const targetIds = event.targetUserIds.filter((id) => id !== workspace.ownerId);
    if (messages.target && targetIds.length) await notificationService.notify(targetIds, { ...base, ...messages.target(context) });
    await notificationService.notify([workspace.ownerId], { ...base, ...messages.owner(context) });

    // Membership changed: affected clients reload their workspaces/projects without a page refresh.
    realtime.emit([...event.targetUserIds, workspace.ownerId, event.actorId], 'workspace.changed', {
      workspaceId: event.workspaceId,
      projectId: event.projectId,
      type: event.type,
    });
  } catch (e) {
    console.error('workspace event notification failed', e);
  }
}

/** Controller helper: fires the notification for a `{ result, event }` service outcome and returns the result. */
export function withNotification<T>(outcome: { result: T; event: WorkspaceEvent | null }): T {
  void notifyWorkspaceEvent(outcome.event);
  return outcome.result;
}
