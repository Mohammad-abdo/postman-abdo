import { Prisma } from '@prisma/client';
import { cache } from '../../core/cache/cache.service';
import { json, prisma } from '../../core/database/prisma';
import { BadRequest, Forbidden, NotFound } from '../../core/errors/http-error';
import { notificationService } from '../notifications/notification.service';
import { onPresenceChange, realtime } from '../realtime/realtime.hub';
import { assertWorkspaceMember } from '../workspaces/workspace.access';
import { AttachmentInput, OpenConversationInput, SendMessageInput } from './chat.schema';

const PAGE_SIZE = 50;
const userSelect = { id: true, name: true, email: true, avatarUrl: true } as const;

const messageInclude = { sender: { select: userSelect } } satisfies Prisma.MessageInclude;
type MessageWithSender = Prisma.MessageGetPayload<{ include: typeof messageInclude }>;

export interface StoredAttachment {
  file: string;
  name: string;
  mimeType: string;
  size: number;
  kind: 'image' | 'video' | 'audio' | 'file';
  voice?: boolean;
  duration?: number;
  width?: number;
  height?: number;
}

const kindOf = (mimeType: string): StoredAttachment['kind'] => {
  const type = mimeType.split('/')[0];
  return type === 'image' || type === 'video' || type === 'audio' ? type : 'file';
};

/** What the chat shows when only attachments were sent (list previews, notifications). */
export function describeAttachments(attachments: StoredAttachment[]) {
  if (!attachments.length) return '';
  const first = attachments[0];
  const label = first.voice
    ? '🎤 Voice message'
    : first.kind === 'image'
      ? '📷 Photo'
      : first.kind === 'video'
        ? '🎬 Video'
        : first.kind === 'audio'
          ? '🎵 Audio'
          : `📎 ${first.name}`;
  return attachments.length > 1 ? `${label} +${attachments.length - 1}` : label;
}

const messageView = (m: MessageWithSender) => ({
  id: m.id,
  conversationId: m.conversationId,
  sender: m.sender,
  body: m.deletedAt ? '' : m.body,
  mentions: (m.mentions as string[]) || [],
  attachments: m.deletedAt
    ? []
    : ((m.attachments as StoredAttachment[] | null) || []).map((a) => ({ ...a, url: `/api/chat/media/${encodeURIComponent(a.file)}` })),
  reactions: m.deletedAt ? {} : (m.reactions as Record<string, string[]> | null) || {},
  editedAt: m.editedAt,
  deleted: !!m.deletedAt,
  createdAt: m.createdAt,
});

async function memberIds(conversationId: string) {
  return cache.wrap(`chat:members:${conversationId}`, 60, async () =>
    (await prisma.conversationMember.findMany({ where: { conversationId }, select: { userId: true } })).map((m) => m.userId),
  );
}

const invalidateMembers = (conversationId: string) => cache.invalidate(`chat:members:${conversationId}`);

async function assertConversationMember(userId: string, conversationId: string) {
  const conversation = await prisma.conversation.findUnique({ where: { id: conversationId } });
  if (!conversation) throw NotFound('Conversation not found');
  if (!(await memberIds(conversationId)).includes(userId)) throw Forbidden('You are not part of this conversation');
  return conversation;
}

async function addMembers(conversationId: string, userIds: string[]) {
  if (!userIds.length) return;
  await prisma.conversationMember.createMany({ data: userIds.map((userId) => ({ conversationId, userId })), skipDuplicates: true });
  await invalidateMembers(conversationId);
}

/**
 * Keeps implicit memberships in sync: #general = every workspace member, a project channel = the project members.
 * Called whenever a member opens chat, so changes made elsewhere are reflected without extra hooks.
 */
async function syncWorkspaceChannels(workspaceId: string, createdById: string) {
  const general =
    (await prisma.conversation.findFirst({ where: { workspaceId, isDefault: true } })) ||
    (await prisma.conversation.create({ data: { workspaceId, type: 'channel', name: 'general', isDefault: true, createdById } }));
  const workspaceMembers = (await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } })).map((m) => m.userId);
  await syncMembers(general.id, workspaceMembers);

  const projects = await prisma.project.findMany({ where: { workspaceId }, select: { id: true, name: true, members: { select: { userId: true } } } });
  for (const project of projects) {
    const channel =
      (await prisma.conversation.findFirst({ where: { workspaceId, projectId: project.id, type: 'channel' } })) ||
      (await prisma.conversation.create({ data: { workspaceId, projectId: project.id, type: 'channel', name: project.name, createdById } }));
    if (channel.name !== project.name) await prisma.conversation.update({ where: { id: channel.id }, data: { name: project.name } });
    await syncMembers(channel.id, project.members.map((m) => m.userId));
  }
  // Channels of deleted projects disappear with their project.
  await prisma.conversation.deleteMany({ where: { workspaceId, projectId: { notIn: projects.map((p) => p.id) }, NOT: { projectId: null } } });
}

async function syncMembers(conversationId: string, wanted: string[]) {
  const current = await memberIds(conversationId);
  const toAdd = wanted.filter((id) => !current.includes(id));
  const toRemove = current.filter((id) => !wanted.includes(id));
  if (toAdd.length) await addMembers(conversationId, toAdd);
  if (toRemove.length) {
    await prisma.conversationMember.deleteMany({ where: { conversationId, userId: { in: toRemove } } });
    await invalidateMembers(conversationId);
  }
}

/** `@Sara` or `@sara.k` → workspace members whose name/email prefix matches. */
function findMentions(body: string, members: { id: string; name: string; email: string }[]) {
  const handles = Array.from(body.matchAll(/@([\p{L}\d._-]+)/gu)).map((m) => m[1].toLowerCase());
  if (!handles.length) return [];
  return members
    .filter((u) => handles.some((h) => u.name.toLowerCase().replace(/\s+/g, '') === h || u.name.toLowerCase().split(/\s+/)[0] === h || u.email.split('@')[0].toLowerCase() === h))
    .map((u) => u.id);
}

/** Attachments must be files this user uploaded; name/type/size come from the upload record, never from the client. */
async function resolveAttachments(userId: string, inputs: AttachmentInput[]): Promise<StoredAttachment[]> {
  if (!inputs.length) return [];
  const files = await prisma.uploadedFile.findMany({ where: { userId, storedName: { in: inputs.map((i) => i.file) } } });
  return inputs.map((input) => {
    const file = files.find((f) => f.storedName === input.file);
    if (!file) throw BadRequest('Attachment not found. Please upload it again.');
    const mimeType = file.mimeType || 'application/octet-stream';
    const kind = kindOf(mimeType);
    return {
      file: file.storedName,
      name: file.originalName,
      mimeType,
      size: file.size,
      kind,
      ...(input.voice && kind === 'audio' ? { voice: true } : {}),
      ...(input.duration !== undefined ? { duration: input.duration } : {}),
      ...(input.width && input.height ? { width: input.width, height: input.height } : {}),
    };
  });
}

export const chatService = {
  async list(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    await syncWorkspaceChannels(workspaceId, userId);
    const conversations = await prisma.conversation.findMany({
      where: { workspaceId, members: { some: { userId } } },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        members: { include: { user: { select: userSelect } } },
        messages: { orderBy: { createdAt: 'desc' }, take: 1, include: messageInclude },
      },
    });
    const allMemberIds = [...new Set(conversations.flatMap((c) => c.members.map((m) => m.userId)))];
    const online = new Set(await realtime.online(allMemberIds));
    return Promise.all(
      conversations.map(async (c) => {
        const me = c.members.find((m) => m.userId === userId)!;
        const unread = await prisma.message.count({
          where: { conversationId: c.id, createdAt: { gt: me.lastReadAt }, senderId: { not: userId }, deletedAt: null },
        });
        return {
          id: c.id,
          type: c.type,
          name: c.name,
          projectId: c.projectId,
          isDefault: c.isDefault,
          muted: me.muted,
          unread,
          lastMessageAt: c.lastMessageAt,
          lastMessage: c.messages[0] ? messageView(c.messages[0]) : null,
          members: c.members.map((m) => ({ ...m.user, online: online.has(m.userId), lastReadAt: m.lastReadAt })),
        };
      }),
    );
  },

  async open(userId: string, input: OpenConversationInput) {
    await assertWorkspaceMember(userId, input.workspaceId);
    if (input.type === 'direct') {
      if (input.userId === userId) throw BadRequest('You cannot message yourself');
      await assertWorkspaceMember(input.userId, input.workspaceId);
      const directKey = `${input.workspaceId}:${[userId, input.userId].sort().join(':')}`;
      const conversation =
        (await prisma.conversation.findUnique({ where: { directKey } })) ||
        (await prisma.conversation.create({ data: { workspaceId: input.workspaceId, type: 'direct', directKey, createdById: userId } }));
      await addMembers(conversation.id, [userId, input.userId]);
      return { id: conversation.id };
    }
    const workspaceMembers = (await prisma.workspaceMember.findMany({ where: { workspaceId: input.workspaceId }, select: { userId: true } })).map((m) => m.userId);
    const invalid = input.memberIds.filter((id) => !workspaceMembers.includes(id));
    if (invalid.length) throw BadRequest('Channel members must belong to the workspace');
    const conversation = await prisma.conversation.create({ data: { workspaceId: input.workspaceId, type: 'channel', name: input.name, createdById: userId } });
    const members = [...new Set([userId, ...input.memberIds])];
    await addMembers(conversation.id, members);
    realtime.emit(members, 'chat.conversation', { conversationId: conversation.id, workspaceId: input.workspaceId });
    return { id: conversation.id };
  },

  async update(userId: string, conversationId: string, input: { name?: string; muted?: boolean }) {
    const conversation = await assertConversationMember(userId, conversationId);
    if (input.muted !== undefined) {
      await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { muted: input.muted } });
    }
    if (input.name && conversation.type === 'channel' && !conversation.isDefault && !conversation.projectId) {
      await prisma.conversation.update({ where: { id: conversationId }, data: { name: input.name } });
      realtime.emit(await memberIds(conversationId), 'chat.conversation', { conversationId, workspaceId: conversation.workspaceId });
    }
    return { ok: true };
  },

  async addMembers(userId: string, conversationId: string, userIds: string[]) {
    const conversation = await assertConversationMember(userId, conversationId);
    if (conversation.type !== 'channel' || conversation.isDefault || conversation.projectId) throw BadRequest('Members of this conversation are managed automatically');
    for (const id of userIds) await assertWorkspaceMember(id, conversation.workspaceId);
    await addMembers(conversationId, userIds);
    realtime.emit(await memberIds(conversationId), 'chat.conversation', { conversationId, workspaceId: conversation.workspaceId });
    return { ok: true };
  },

  async leave(userId: string, conversationId: string) {
    const conversation = await assertConversationMember(userId, conversationId);
    if (conversation.isDefault || conversation.projectId) throw BadRequest('You cannot leave this channel');
    await prisma.conversationMember.delete({ where: { conversationId_userId: { conversationId, userId } } });
    await invalidateMembers(conversationId);
    return { ok: true };
  },

  async messages(userId: string, conversationId: string, before?: string) {
    await assertConversationMember(userId, conversationId);
    const items = await prisma.message.findMany({
      where: { conversationId, ...(before ? { createdAt: { lt: new Date(before) } } : {}) },
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: messageInclude,
    });
    return { items: items.reverse().map(messageView), hasMore: items.length === PAGE_SIZE };
  },

  async send(userId: string, conversationId: string, input: SendMessageInput) {
    const conversation = await assertConversationMember(userId, conversationId);
    if (input.id) {
      const existing = await prisma.message.findUnique({ where: { id: input.id }, include: messageInclude });
      if (existing) return messageView(existing);
    }
    const members = await prisma.conversationMember.findMany({ where: { conversationId }, include: { user: { select: userSelect } } });
    const mentions = findMentions(input.body, members.map((m) => m.user)).filter((id) => id !== userId);
    const attachments = await resolveAttachments(userId, input.attachments);
    const message = await prisma.message.create({
      data: {
        ...(input.id ? { id: input.id } : {}),
        conversationId,
        senderId: userId,
        body: input.body,
        mentions: mentions.length ? json(mentions) : undefined,
        attachments: attachments.length ? json(attachments) : undefined,
      },
      include: messageInclude,
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { lastMessageAt: message.createdAt } });
    await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: message.createdAt } });

    const view = messageView(message);
    realtime.emit(members.map((m) => m.userId), 'chat.message', { message: view, workspaceId: conversation.workspaceId });

    // Mentions always notify; direct messages notify recipients who are not online right now (so nothing is missed).
    const sender = message.sender.name;
    const link = { kind: 'conversation' as const, id: conversationId, workspaceId: conversation.workspaceId };
    const text = input.body || describeAttachments(attachments);
    const preview = text.length > 140 ? `${text.slice(0, 140)}…` : text;
    if (mentions.length) {
      await notificationService.notify(mentions, {
        type: 'message.mention',
        title: `${sender} mentioned you${conversation.name ? ` in #${conversation.name}` : ''}`,
        body: preview,
        workspaceId: conversation.workspaceId,
        actor: { id: userId, name: sender },
        link,
      });
    }
    if (conversation.type === 'direct') {
      const others = members.map((m) => m.userId).filter((id) => id !== userId && !mentions.includes(id));
      const online = new Set(await realtime.online(others));
      const offline = others.filter((id) => !online.has(id));
      if (offline.length) {
        await notificationService.notify(offline, {
          type: 'message.direct',
          title: `New message from ${sender}`,
          body: preview,
          workspaceId: conversation.workspaceId,
          actor: { id: userId, name: sender },
          link,
          coalesceMinutes: 30,
        });
      }
    }
    return view;
  },

  async edit(userId: string, messageId: string, body: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw NotFound('Message not found');
    if (message.senderId !== userId) throw Forbidden('You can only edit your own messages');
    const updated = await prisma.message.update({ where: { id: messageId }, data: { body, editedAt: new Date() }, include: messageInclude });
    realtime.emit(await memberIds(message.conversationId), 'chat.message_updated', { message: messageView(updated) });
    return messageView(updated);
  },

  async remove(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw NotFound('Message not found');
    if (message.senderId !== userId) throw Forbidden('You can only delete your own messages');
    const updated = await prisma.message.update({ where: { id: messageId }, data: { deletedAt: new Date() }, include: messageInclude });
    realtime.emit(await memberIds(message.conversationId), 'chat.message_updated', { message: messageView(updated) });
    return { ok: true };
  },

  /** Adds the emoji reaction for the user, or removes it if they already reacted with it. */
  async react(userId: string, messageId: string, emoji: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.deletedAt) throw NotFound('Message not found');
    await assertConversationMember(userId, message.conversationId);
    const reactions = { ...((message.reactions as Record<string, string[]> | null) || {}) };
    const users = reactions[emoji] || [];
    const next = users.includes(userId) ? users.filter((id) => id !== userId) : [...users, userId];
    if (next.length) reactions[emoji] = next;
    else delete reactions[emoji];
    const updated = await prisma.message.update({ where: { id: messageId }, data: { reactions: json(reactions) }, include: messageInclude });
    const view = messageView(updated);
    realtime.emit(await memberIds(message.conversationId), 'chat.message_updated', { message: view });
    return view;
  },

  /** Media is visible to its uploader and to members of the workspace it was uploaded in. */
  async mediaFor(userId: string, file: string) {
    const upload = await prisma.uploadedFile.findUnique({ where: { storedName: file } });
    if (!upload) throw NotFound('File not found');
    if (upload.userId !== userId) {
      if (!upload.workspaceId) throw NotFound('File not found');
      await assertWorkspaceMember(userId, upload.workspaceId);
    }
    return upload;
  },

  async markRead(userId: string, conversationId: string) {
    await assertConversationMember(userId, conversationId);
    const readAt = new Date();
    await prisma.conversationMember.update({ where: { conversationId_userId: { conversationId, userId } }, data: { lastReadAt: readAt } });
    // Everyone in the conversation learns who has read up to now, so senders see their messages turn "read".
    realtime.emit(await memberIds(conversationId), 'chat.read', { conversationId, userId, readAt });
    return { ok: true };
  },

  /** Who has read a message and when (the "Seen by" list). Only the sender sees it, like WhatsApp's message info. */
  async readers(userId: string, messageId: string) {
    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message) throw NotFound('Message not found');
    await assertConversationMember(userId, message.conversationId);
    if (message.senderId !== userId) throw Forbidden('Only the sender can see who read a message');
    const members = await prisma.conversationMember.findMany({
      where: { conversationId: message.conversationId, userId: { not: userId } },
      include: { user: { select: userSelect } },
    });
    return {
      sentAt: message.createdAt,
      readBy: members.filter((m) => m.lastReadAt >= message.createdAt).map((m) => ({ user: m.user, readAt: m.lastReadAt })),
      pending: members.filter((m) => m.lastReadAt < message.createdAt).map((m) => m.user),
    };
  },

  /** Online members of a workspace (for presence dots). */
  async presence(userId: string, workspaceId: string) {
    await assertWorkspaceMember(userId, workspaceId);
    const members = (await prisma.workspaceMember.findMany({ where: { workspaceId }, select: { userId: true } })).map((m) => m.userId);
    return { online: await realtime.online(members) };
  },
};

/* ---------------------------- realtime wiring ---------------------------- */

const TYPING_THROTTLE_MS = 2000;
const lastTyping = new Map<string, number>();

realtime.on('chat.typing', async (userId, message) => {
  const conversationId = String(message.payload?.conversationId || '');
  const key = `${userId}:${conversationId}`;
  if (Date.now() - (lastTyping.get(key) || 0) < TYPING_THROTTLE_MS) return;
  lastTyping.set(key, Date.now());
  const members = await memberIds(conversationId).catch(() => [] as string[]);
  if (!members.includes(userId)) return;
  realtime.emit(members.filter((id) => id !== userId), 'chat.typing', { conversationId, userId });
});

/** Tell co-workers when someone comes online / goes offline. */
onPresenceChange(async (userId, online) => {
  const workspaces = await prisma.workspaceMember.findMany({ where: { userId }, select: { workspaceId: true } });
  const coworkers = await prisma.workspaceMember.findMany({
    where: { workspaceId: { in: workspaces.map((w) => w.workspaceId) }, userId: { not: userId } },
    select: { userId: true },
  });
  realtime.emit(coworkers.map((c) => c.userId), 'presence', { userId, online });
});
