import { prisma } from '../../config/db';
import { AppError } from '../../utils/errors';
import { orchestratorService } from '../orchestration/orchestrator.service';
import { workspaceService } from '../workspace/workspace.service';
import { telegramIntegrationService } from '../integrations/telegram.service';
import { googleIntegrationService } from '../integrations/google.service';
import { realtimeService } from '../realtime/realtime.service';

export class ApprovalService {
  public async listApprovals(userId: string, status?: string) {
    const where: any = { userId };
    if (status) {
      where.status = status;
    }
    return prisma.approval.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: {
            id: true,
            conversationId: true,
            title: true,
            description: true,
            status: true,
          },
        },
      },
    });
  }

  public async listPendingApprovals(userId: string) {
    return this.listApprovals(userId, 'pending');
  }

  public async getApprovalById(userId: string, approvalId: string) {
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, userId },
      include: {
        task: {
          select: {
            id: true,
            conversationId: true,
            title: true,
            description: true,
            status: true,
          },
        },
      },
    });

    if (!approval) {
      throw new AppError('Approval record not found or access denied', 404, 'APPROVAL_NOT_FOUND');
    }

    return approval;
  }

  public async approveAction(
    userId: string,
    approvalId: string,
    reason = 'Approved by user',
    editedDraft?: {
      recipient?: string;
      subject?: string;
      bodyDraft?: string;
      text?: string;
    }
  ) {
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, userId },
    });

    if (!approval) {
      throw new AppError('Approval record not found or access denied', 404, 'APPROVAL_NOT_FOUND');
    }

    if (approval.status !== 'pending') {
      throw new AppError(
        `Approval has already been resolved with status '${approval.status}'`,
        400,
        'APPROVAL_ALREADY_RESOLVED'
      );
    }

    const args: any = {
      ...(approval.actionArguments || {}),
      ...(editedDraft?.recipient ? { recipient: editedDraft.recipient } : {}),
      ...(editedDraft?.subject ? { subject: editedDraft.subject } : {}),
      ...(editedDraft?.bodyDraft ? { bodyDraft: editedDraft.bodyDraft } : {}),
      ...(editedDraft?.text ? { text: editedDraft.text } : {}),
    };

    await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'approved',
        resolutionReason: reason,
        actionArguments: args as any,
        resolvedAt: new Date(),
      },
    });

    let executionResult: Record<string, any> = {};

    try {
      if (approval.actionName === 'telegram.send_message') {
        const messageText = args.text || args.bodyDraft || 'Anavya Notification';
        const delivery = await telegramIntegrationService.sendMessage(
          userId,
          messageText,
          args.chatId
        );
        executionResult = {
          simulated: false,
          action: 'telegram.send_message',
          appName: 'Telegram',
          delivered: true,
          delivery,
          note: `Telegram notification sent to ${delivery.chatTitle || delivery.chatId} (Message ID: ${delivery.messageId}).`,
        };
      } else if (approval.actionName === 'gmail.send_message') {
        const recipient = args.recipient || 'client@example.com';
        const subject = args.subject || 'Anavya Executive Report';
        const body = args.bodyDraft || args.body || 'Please see attached summary from Anavya.';
        const sent = await googleIntegrationService.sendGmailMessage(
          userId,
          recipient,
          subject,
          body
        );
        executionResult = {
          simulated: false,
          action: 'gmail.send_message',
          appName: 'Gmail',
          delivered: true,
          sent,
          recipient,
          subject,
          note: `Email "${subject}" sent via Gmail to ${recipient} (Message ID: ${sent.messageId}).`,
        };
      } else if (approval.actionName === 'google_sheets.append_rows') {
        const appendRes = await googleIntegrationService.appendRows(
          userId,
          args.spreadsheetId,
          args.range || 'Sheet1!A1',
          args.values || []
        );
        executionResult = {
          simulated: false,
          action: 'google_sheets.append_rows',
          appName: 'Google Sheets',
          result: appendRes,
          note: `Appended ${appendRes.updatedRows} row(s) to Google Sheet '${args.spreadsheetId}'.`,
        };
      } else if (approval.actionName === 'google_sheets.update_range') {
        const updateRes = await googleIntegrationService.updateRange(
          userId,
          args.spreadsheetId,
          args.range,
          args.values || []
        );
        executionResult = {
          simulated: false,
          action: 'google_sheets.update_range',
          appName: 'Google Sheets',
          result: updateRes,
          note: `Updated range ${updateRes.updatedRange} in Google Sheet '${args.spreadsheetId}'.`,
        };
      } else if (approval.actionName === 'delete_file' && args.targetId) {
        const deleted = await workspaceService.deleteFile(userId, args.targetId);
        executionResult = {
          simulated: false,
          action: 'delete_file',
          deletedFile: deleted,
          note: 'File deleted after explicit human approval.',
        };
      } else {
        const draftFilename = `approved_${approval.actionName}_${approval.id.slice(0, 8)}.md`;
        const draftContent = `# Simulated Action Execution Record (Human Approved)
- **Approval ID**: ${approval.id}
- **Action Name**: ${approval.actionName}
- **Status**: Authorized & Simulated (No real external email was transmitted)
- **Recipient**: ${args.recipient || 'client@example.com'}
- **Subject**: ${args.subject || 'Summary Report'}
- **Resolution Reason**: ${reason}
- **Approved Timestamp**: ${new Date().toISOString()}

## Approved Draft Content
${args.bodyDraft || 'No body draft attached.'}
`;
        const savedFile = await workspaceService.writeGeneratedFile(
          userId,
          draftFilename,
          draftContent
        );

        executionResult = {
          simulated: true,
          emailActuallySent: false,
          action: approval.actionName,
          appName: approval.actionName === 'send_email' ? 'Gmail' : 'Anavya Approval Engine',
          recipient: args.recipient || 'client@example.com',
          subject: args.subject || 'Summary Report',
          artifactFileId: savedFile.id,
          artifactFilename: savedFile.filename,
          note: 'Human approval verified. Safe simulated action recorded in workspace without sending real external email.',
        };
      }

      const updatedApproval = await prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'executed',
          actionArguments: {
            ...args,
            executionResult,
          } as any,
        },
      });

      const waitingStep = await prisma.taskStep.findFirst({
        where: {
          taskId: approval.taskId,
          status: 'waiting_for_approval',
        },
        orderBy: { sequence: 'asc' },
      });

      if (waitingStep) {
        const prevOutput: any = waitingStep.output || {};
        await prisma.taskStep.update({
          where: { id: waitingStep.id },
          data: {
            status: 'completed',
            completedAt: new Date(),
            output: {
              ...prevOutput,
              status: 'completed',
              summary: `Human approved action '${approval.actionName}'. ${executionResult.note}`,
              approvalExecution: executionResult,
              artifacts: executionResult.artifactFileId
                ? [
                    {
                      fileId: executionResult.artifactFileId,
                      filename: executionResult.artifactFilename,
                      fileType: 'md',
                      size: 0,
                      downloadUrl: `/api/v1/workspace/files/${executionResult.artifactFileId}/download`,
                    },
                  ]
                : [],
            } as any,
          },
        });
      }

      await prisma.task.update({
        where: { id: approval.taskId },
        data: { status: 'running' },
      });

      // If this task belongs to a chat conversation, record approval event & message
      const taskRecord = await prisma.task.findUnique({ where: { id: approval.taskId } });
      const convId = approval.conversationId || taskRecord?.conversationId;

      if (convId) {
        const senderAppName =
          approval.actionName === 'telegram.send_message'
            ? 'Telegram'
            : approval.actionName === 'gmail.send_message' || approval.actionName === 'send_email'
            ? 'Gmail'
            : approval.actionName.startsWith('google_sheets')
            ? 'Google Sheets'
            : 'Approval Engine';

        const msg = await prisma.chatMessage.create({
          data: {
            conversationId: convId,
            senderType: 'tool',
            senderName: senderAppName,
            agentRole: 'coordinator',
            content: executionResult.note,
            approvalId: approval.id,
            metadata: {
              type: 'approval_executed',
              appName: senderAppName,
              actionName: approval.actionName,
              executionResult,
            } as any,
          },
        });

        realtimeService.emitToUser(
          userId,
          'conversation.message.created',
          { message: msg },
          { conversationId: convId, taskId: approval.taskId }
        );
      }

      realtimeService.emitToUser(
        userId,
        'approval.approved',
        {
          approvalId: approval.id,
          actionName: approval.actionName,
          executionResult,
        },
        { conversationId: convId || undefined, taskId: approval.taskId }
      );

      const resumedTask = await orchestratorService.runPendingTaskSteps(userId, approval.taskId);

      return {
        approval: updatedApproval,
        executionResult,
        task: resumedTask,
      };
    } catch (err: any) {
      await prisma.approval.update({
        where: { id: approval.id },
        data: {
          status: 'failed',
        },
      });
      throw err;
    }
  }

  public async rejectAction(userId: string, approvalId: string, reason = 'Rejected by user') {
    const approval = await prisma.approval.findFirst({
      where: { id: approvalId, userId },
    });

    if (!approval) {
      throw new AppError('Approval record not found or access denied', 404, 'APPROVAL_NOT_FOUND');
    }

    if (approval.status !== 'pending') {
      throw new AppError(
        `Approval has already been resolved with status '${approval.status}'`,
        400,
        'APPROVAL_ALREADY_RESOLVED'
      );
    }

    const updatedApproval = await prisma.approval.update({
      where: { id: approval.id },
      data: {
        status: 'rejected',
        resolutionReason: reason,
        resolvedAt: new Date(),
      },
    });

    await prisma.taskStep.updateMany({
      where: {
        taskId: approval.taskId,
        status: { in: ['waiting_for_approval', 'pending'] },
      },
      data: {
        status: 'skipped',
        completedAt: new Date(),
      },
    });

    const updatedTask = await prisma.task.update({
      where: { id: approval.taskId },
      data: {
        status: 'cancelled',
        error: `Task terminated because protected action '${approval.actionName}' was rejected by user: ${reason}`,
        completedAt: new Date(),
      },
      include: {
        steps: { orderBy: { sequence: 'asc' } },
      },
    });

    const convId = approval.conversationId || updatedTask.conversationId;
    if (convId) {
      await prisma.chatConversation.update({
        where: { id: convId },
        data: { status: 'cancelled' },
      });

      const msg = await prisma.chatMessage.create({
        data: {
          conversationId: convId,
          senderType: 'agent',
          senderName: 'Coordinator Agent',
          agentRole: 'coordinator',
          content: `Action '${approval.actionName}' was rejected (${reason}). I have cancelled the remaining steps of this task.`,
          approvalId: approval.id,
          metadata: { type: 'approval_rejected', approvalId: approval.id } as any,
        },
      });

      realtimeService.emitToUser(
        userId,
        'conversation.message.created',
        { message: msg },
        { conversationId: convId, taskId: approval.taskId }
      );
    }

    realtimeService.emitToUser(
      userId,
      'approval.rejected',
      {
        approvalId: approval.id,
        actionName: approval.actionName,
        reason,
      },
      { conversationId: convId || undefined, taskId: approval.taskId }
    );

    return {
      approval: updatedApproval,
      task: updatedTask,
    };
  }
}

export const approvalService = new ApprovalService();
