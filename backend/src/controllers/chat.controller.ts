import { Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '../config/env';
import { AuthenticatedRequest, AuthUser } from '../types';
import { sendSuccess } from '../utils/response';
import { chatService } from '../services/chat/chat.service';
import { realtimeService } from '../services/realtime/realtime.service';
import { AppError } from '../utils/errors';

export class ChatController {
  public async createConversation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { title, agentRole } = req.body;
      const conversation = await chatService.createConversation(userId, { title, agentRole });
      return sendSuccess(res, { conversation }, 'Conversation created', 201);
    } catch (err) {
      next(err);
    }
  }

  public async listConversations(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const search = req.query.search ? String(req.query.search) : undefined;
      const conversations = await chatService.listConversations(userId, search);
      return sendSuccess(res, { conversations }, 'Conversations retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async getConversationById(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const conversationId = String(req.params.id);
      const conversation = await chatService.getConversationById(userId, conversationId);
      return sendSuccess(res, { conversation }, 'Conversation retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async updateConversation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const conversationId = String(req.params.id);
      const { title, agentRole } = req.body;
      const conversation = await chatService.updateConversation(userId, conversationId, {
        title,
        agentRole,
      });
      return sendSuccess(res, { conversation }, 'Conversation updated');
    } catch (err) {
      next(err);
    }
  }

  public async deleteConversation(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const conversationId = String(req.params.id);
      const result = await chatService.deleteConversation(userId, conversationId);
      return sendSuccess(res, result, 'Conversation deleted');
    } catch (err) {
      next(err);
    }
  }

  public async sendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const conversationId = String(req.params.id);
      const { content, attachmentId, spreadsheetId } = req.body;

      const result = await chatService.sendMessageAndExecute(userId, conversationId, {
        content,
        attachmentId,
        spreadsheetId,
      });

      return sendSuccess(res, result, 'Message processed and task executed', 201);
    } catch (err) {
      next(err);
    }
  }

  public async streamEvents(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      let userId = req.user?.id;
      if (!userId && req.query.token) {
        try {
          const decoded = jwt.verify(String(req.query.token), env.JWT_SECRET) as AuthUser;
          userId = decoded.id;
        } catch (_e) {
          throw new AppError('Invalid SSE token', 401, 'INVALID_TOKEN');
        }
      }

      if (!userId) {
        throw new AppError('Authentication required for event stream', 401, 'UNAUTHORIZED');
      }

      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.setHeader('Connection', 'keep-alive');
      res.flushHeaders?.();

      res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', userId })}\n\n`);
      realtimeService.addClient(userId, res);
    } catch (err) {
      next(err);
    }
  }
}

export const chatController = new ChatController();

