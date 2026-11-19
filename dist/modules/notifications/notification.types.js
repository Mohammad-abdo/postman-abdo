"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NOTIFICATION_CATEGORIES = void 0;
exports.categoryOf = categoryOf;
/** Categories group notification types; each category can have its own tone and can be muted by the user. */
exports.NOTIFICATION_CATEGORIES = {
    message: 'New chat messages',
    mention: 'Mentions (@you)',
    invite: 'Invitations to workspaces and projects',
    activity: 'Team activity in your workspaces',
    system: 'Announcements and account notices',
};
function categoryOf(type) {
    if (type.startsWith('message.mention'))
        return 'mention';
    if (type.startsWith('message.'))
        return 'message';
    if (type.endsWith('.invited') || type === 'workspace.member_added' || type === 'project.member_added')
        return 'invite';
    if (type.startsWith('system.'))
        return 'system';
    return 'activity';
}
