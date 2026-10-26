/**
 * Describes a membership/project change so callers (e.g. notifications) can react to it.
 * Mutating workspace/project service functions return one of these alongside their result.
 */
export type WorkspaceEventType =
  | 'workspace.member_added'
  | 'workspace.member_role_changed'
  | 'workspace.member_removed'
  | 'workspace.member_left'
  | 'project.created'
  | 'project.deleted'
  | 'project.member_added'
  | 'project.member_role_changed'
  | 'project.member_removed'
  | 'project.member_left';

export interface WorkspaceEvent {
  type: WorkspaceEventType;
  actorId: string;
  workspaceId: string;
  projectId?: string;
  projectName?: string;
  /** Users affected by the change (added, removed, role changed; project members for create/delete). */
  targetUserIds: string[];
  role?: string;
}

export interface WithEvent<T> {
  result: T;
  event: WorkspaceEvent | null;
}
