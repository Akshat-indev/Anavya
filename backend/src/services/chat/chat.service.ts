import { prisma } from '../../config/db';
import { AppError } from '../../utils/errors';
import { orchestratorService } from '../orchestration/orchestrator.service';
import { realtimeService } from '../realtime/realtime.service';

export class ChatService {
  public async createConversation(
    userId: string,
    input: { title?: string; agentRole?: string }
  ) {
    const title = input.title?.trim() || 'New Autonomous Workspace';
    const agentRole = input.agentRole || 'coordinator';

    const conversation = await prisma.chatConversation.create({
      data: {
        userId,
        title,
        agentRole,
        status: 'idle',
      },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        tasks: true,
      },
    });

    return conversation;
  }

  public async listConversations(userId: string, search?: string) {
    const where: any = { userId };
    if (search && search.trim() !== '') {
      where.title = {
        contains: search.trim(),
        mode: 'insensitive',
      };
    }

    const conversations = await prisma.chatConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      include: {
        messages: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
        tasks: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return conversations.map((c: any) => ({
      id: c.id,
      userId: c.userId,
      title: c.title,
      agentRole: c.agentRole,
      status: c.tasks?.[0]?.status || c.status || 'idle',
      lastMessagePreview: c.messages?.[0]?.content?.slice(0, 90) || 'No messages yet',
      lastActivityAt: c.messages?.[0]?.createdAt || c.updatedAt,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
    }));
  }

  public async getConversationById(userId: string, conversationId: string) {
    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
      include: {
        messages: { orderBy: { createdAt: 'asc' } },
        tasks: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!conversation) {
      throw new AppError('Conversation not found or access denied', 404, 'CONVERSATION_NOT_FOUND');
    }

    return conversation;
  }

  public async updateConversation(
    userId: string,
    conversationId: string,
    updates: { title?: string; agentRole?: string }
  ) {
    const existing = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!existing) {
      throw new AppError('Conversation not found or access denied', 404, 'CONVERSATION_NOT_FOUND');
    }

    const updated = await prisma.chatConversation.update({
      where: { id: existing.id },
      data: {
        ...(updates.title ? { title: updates.title.trim() } : {}),
        ...(updates.agentRole ? { agentRole: updates.agentRole } : {}),
      },
    });

    if (updates.title && updates.title.trim() !== existing.title) {
      await prisma.chatMessage.create({
        data: {
          conversationId,
          senderType: 'system',
          senderName: 'System',
          content: `Renamed to ${updates.title.trim()}`,
          metadata: { type: 'rename_event', newTitle: updates.title.trim() } as any,
        },
      });
    }

    return updated;
  }

  public async deleteConversation(userId: string, conversationId: string) {
    const existing = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
    });

    if (!existing) {
      throw new AppError('Conversation not found or access denied', 404, 'CONVERSATION_NOT_FOUND');
    }

    await prisma.chatMessage.deleteMany({ where: { conversationId } });
    await prisma.chatConversation.delete({ where: { id: conversationId } });

    return { deletedId: conversationId };
  }

  public async sendMessageAndExecute(
    userId: string,
    conversationId: string,
    input: {
      content: string;
      attachmentId?: string;
      spreadsheetId?: string;
    }
  ) {
    const conversation = await prisma.chatConversation.findFirst({
      where: { id: conversationId, userId },
      include: { messages: true },
    });

    if (!conversation) {
      throw new AppError('Conversation not found or access denied', 404, 'CONVERSATION_NOT_FOUND');
    }

    // 1. Save User Message
    const userMessage = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderType: 'user',
        senderName: 'User',
        content: input.content,
        attachmentId: input.attachmentId || null,
        metadata: input.spreadsheetId ? ({ spreadsheetId: input.spreadsheetId } as any) : {},
      },
    });

    realtimeService.emitToUser(
      userId,
      'conversation.message.created',
      { message: userMessage },
      { conversationId }
    );

    // Auto-rename conversation if it's the first message and has generic title
    if (
      conversation.messages.length === 0 &&
      (conversation.title === 'New Autonomous Workspace' || conversation.title === 'New Conversation')
    ) {
      const autoTitle = input.content
        .replace(/[^\w\s-]/g, '')
        .trim()
        .split(/\s+/)
        .slice(0, 4)
        .join(' ');
      if (autoTitle.length >= 3) {
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { title: autoTitle },
        });
      }
    }

    // 2. Run Orchestrator Task tied to this conversation
    const task = await orchestratorService.createAndRunTask(userId, {
      title: input.content.slice(0, 80),
      description: input.content,
      conversationId,
      spreadsheetId: input.spreadsheetId,
    });

    const updatedConversation = await this.getConversationById(userId, conversationId);

    return {
      userMessage,
      task,
      conversation: updatedConversation,
    };
  }
}

export const chatService = new ChatService();

