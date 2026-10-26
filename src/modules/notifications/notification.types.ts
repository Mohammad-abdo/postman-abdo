/** Categories group notification types; each category can have its own tone and can be muted by the user. */
export const NOTIFICATION_CATEGORIES = {
  message: 'New chat messages',
  mention: 'Mentions (@you)',
  invite: 'Invitations to workspaces and projects',
  activity: 'Team activity in your workspaces',
  system: 'Announcements and account notices',
} as const;

export type NotificationCategory = keyof typeof NOTIFICATION_CATEGORIES;

export function categoryOf(type: string): NotificationCategory {
  if (type.startsWith('message.mention')) return 'mention';
  if (type.startsWith('message.')) return 'message';
  if (type.endsWith('.invited') || type === 'workspace.member_added' || type === 'project.member_added') return 'invite';
  if (type.startsWith('system.')) return 'system';
  return 'activity';
}

export interface NotificationLink {
  kind: 'workspace' | 'project' | 'collection' | 'folder' | 'request' | 'environment' | 'conversation' | 'account' | 'mock' | 'monitor';
  id?: string;
  workspaceId?: string;
}

export interface NotifyInput {
  type: string;
  title: string;
  body?: string;
  workspaceId?: string | null;
  projectId?: string | null;
  actor?: { id: string; name?: string | null } | null;
  link?: NotificationLink | null;
  /**
   * Identical events from the same actor about the same target within this window are merged
   * into one notification ("Sara updated Login request · 5 times").
   */
  coalesceMinutes?: number;
}
