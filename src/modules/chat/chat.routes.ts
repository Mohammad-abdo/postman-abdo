import { Router } from 'express';
import { validateBody } from '../../core/middleware/validate.middleware';
import { rateLimits } from '../../core/security/rate-limit.middleware';
import { chatController } from './chat.controller';
import { addConversationMembersSchema, editMessageSchema, openConversationSchema, reactSchema, sendMessageSchema, updateConversationSchema } from './chat.schema';
import { chatUpload } from './chat.upload';

export const chatRoutes = Router();

chatRoutes.get('/conversations', chatController.list);
chatRoutes.post('/conversations', validateBody(openConversationSchema), chatController.open);
chatRoutes.patch('/conversations/:id', validateBody(updateConversationSchema), chatController.update);
chatRoutes.post('/conversations/:id/members', validateBody(addConversationMembersSchema), chatController.addMembers);
chatRoutes.delete('/conversations/:id/members/me', chatController.leave);
chatRoutes.get('/conversations/:id/messages', chatController.messages);
chatRoutes.post('/conversations/:id/messages', validateBody(sendMessageSchema), chatController.send);
chatRoutes.post('/conversations/:id/read', chatController.markRead);
chatRoutes.patch('/messages/:id', validateBody(editMessageSchema), chatController.edit);
chatRoutes.delete('/messages/:id', chatController.remove);
chatRoutes.get('/messages/:id/readers', chatController.readers);
chatRoutes.put('/messages/:id/reactions', validateBody(reactSchema), chatController.react);
chatRoutes.post('/upload', rateLimits.upload(), chatUpload.single('file'), chatController.upload);
chatRoutes.get('/media/:name', chatController.media);
chatRoutes.get('/presence', chatController.presence);
