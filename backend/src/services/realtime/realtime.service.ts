import { Response } from 'express';

export type RealtimeEventType =
  | 'conversation.message.created'
  | 'task.created'
  | 'task.plan.created'
  | 'agent.execution.started'
  | 'agent.execution.completed'
  | 'agent.execution.failed'
  | 'tool.execution.started'
  | 'tool.execution.completed'
  | 'tool.execution.failed'
  | 'approval.required'
  | 'approval.approved'
  | 'approval.rejected'
  | 'task.completed'
  | 'task.failed';

export interface RealtimeEventPayload {
  event: RealtimeEventType;
  userId: string;
  conversationId?: string;
  taskId?: string;
  timestamp: string;
  data: any;
}

class RealtimeService {
  private clients: Map<string, Set<Response>> = new Map();

  public addClient(userId: string, res: Response): void {
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(res);

    res.on('close', () => {
      this.removeClient(userId, res);
    });
  }

  public removeClient(userId: string, res: Response): void {
    const userClients = this.clients.get(userId);
    if (userClients) {
      userClients.delete(res);
      if (userClients.size === 0) {
        this.clients.delete(userId);
      }
    }
  }

  public emitToUser(
    userId: string,
    event: RealtimeEventType,
    data: any,
    context?: { conversationId?: string; taskId?: string }
  ): void {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      return;
    }

    const payload: RealtimeEventPayload = {
      event,
      userId,
      conversationId: context?.conversationId,
      taskId: context?.taskId,
      timestamp: new Date().toISOString(),
      data,
    };

    const serialized = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of userClients) {
      try {
        res.write(serialized);
      } catch (_err) {
        this.removeClient(userId, res);
      }
    }
  }
}

export const realtimeService = new RealtimeService();

