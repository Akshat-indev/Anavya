import { prisma } from '../../config/db';
import { AppError } from '../../utils/errors';
import { ExecutionPlan, PlannedStep } from '../../types';
import { executionPlanSchema } from '../../schemas';
import { geminiService } from '../ai/gemini.service';
import { memoryService } from '../memory/memory.service';
import { workspaceService } from '../workspace/workspace.service';
import { specialistAgentService } from '../agents/specialist-agents.service';
import { googleIntegrationService } from '../integrations/google.service';
import { telegramIntegrationService } from '../integrations/telegram.service';
import { realtimeService } from '../realtime/realtime.service';

const MAX_STEPS_PER_TASK = 8;
const MAX_AGENT_RETRIES = 1;

export class OrchestratorService {
  private async appendConversationMessage(
    userId: string,
    conversationId: string | null | undefined,
    taskId: string,
    params: {
      senderType: 'user' | 'agent' | 'system' | 'tool' | 'approval';
      senderName: string;
      agentRole?: string;
      content: string;
      toolExecutionId?: string;
      approvalId?: string;
      metadata?: Record<string, any>;
    }
  ) {
    if (!conversationId) return null;
    const msg = await prisma.chatMessage.create({
      data: {
        conversationId,
        senderType: params.senderType,
        senderName: params.senderName,
        agentRole: params.agentRole || null,
        content: params.content,
        toolExecutionId: params.toolExecutionId || null,
        approvalId: params.approvalId || null,
        metadata: (params.metadata || {}) as any,
      },
    });

    await prisma.chatConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    realtimeService.emitToUser(
      userId,
      'conversation.message.created',
      { message: msg },
      { conversationId, taskId }
    );

    return msg;
  }

  public async createAndRunTask(
    userId: string,
    input: {
      title?: string;
      description: string;
      conversationId?: string;
      spreadsheetId?: string;
      customPlan?: ExecutionPlan;
    }
  ) {
    const title = input.title || input.description.slice(0, 80);

    const task = await prisma.task.create({
      data: {
        userId,
        conversationId: input.conversationId || null,
        title,
        description: input.description,
        status: 'pending',
      },
    });

    realtimeService.emitToUser(
      userId,
      'task.created',
      { task },
      { conversationId: input.conversationId, taskId: task.id }
    );

    if (input.conversationId) {
      await prisma.chatConversation.update({
        where: { id: input.conversationId },
        data: { status: 'running' },
      });
    }

    return this.executeTaskWorkflow(userId, task.id, input.customPlan, input.spreadsheetId);
  }

  public async executeTaskWorkflow(
    userId: string,
    taskId: string,
    customPlan?: ExecutionPlan,
    spreadsheetId?: string
  ) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new AppError('Task not found or access denied', 404, 'TASK_NOT_FOUND');
    }

    if (task.status === 'cancelled') {
      return this.getTaskDetails(userId, taskId);
    }

    const conversationId = task.conversationId;

    await prisma.task.update({
      where: { id: taskId },
      data: { status: 'planning' },
    });

    // Check connected integrations & inform user in chat if an integration was requested
    const [googleStatus, telegramStatus] = await Promise.all([
      googleIntegrationService.getConnectionStatus(userId),
      telegramIntegrationService.getStatus(userId),
    ]);

    const lowerObj = task.description.toLowerCase();
    const mentionsGoogle =
      lowerObj.includes('google doc') ||
      lowerObj.includes('google sheet') ||
      (lowerObj.includes('spreadsheet') && googleStatus.connected);
    const mentionsTelegram = lowerObj.includes('telegram');

    if (conversationId) {
      const connectedNames: string[] = [];
      const missingNames: string[] = [];
      if (googleStatus.connected) connectedNames.push('Google Workspace (Sheets & Docs)');
      else if (lowerObj.includes('google doc') || lowerObj.includes('google sheet'))
        missingNames.push('Google Workspace');

      if (telegramStatus.connected) connectedNames.push('Telegram');
      else if (mentionsTelegram) missingNames.push('Telegram');

      if (missingNames.length > 0) {
        await this.appendConversationMessage(userId, conversationId, taskId, {
          senderType: 'agent',
          senderName: 'Coordinator Agent',
          agentRole: 'coordinator',
          content: `Checking what's connected. ${connectedNames.length > 0 ? `${connectedNames.join(', ')} already signed in. ` : ''}${missingNames.join(' and ')} ${missingNames.length > 1 ? 'are' : 'is'} not connected yet.`,
          metadata: {
            type: 'connection_check',
            connected: connectedNames,
            missing: missingNames,
          },
        });
      } else {
        await this.appendConversationMessage(userId, conversationId, taskId, {
          senderType: 'agent',
          senderName: 'Coordinator Agent',
          agentRole: 'coordinator',
          content: `I'll coordinate this objective for you${mentionsTelegram ? ' and request your approval before sending any external notification' : ''}. Creating execution plan now.`,
          metadata: {
            type: 'execution_card',
            agentType: 'coordinator',
            title: 'Coordinator Agent',
            subtitle: 'Creating execution plan.',
            status: 'running',
          },
        });
      }
    }

    const coordinatorExec = await prisma.agentExecution.create({
      data: {
        taskId,
        agentType: 'coordinator',
        input: { objective: task.description, phase: 'planning' },
        status: 'running',
      },
    });

    let validatedPlan: ExecutionPlan;
    let planningAiMode: 'gemini' | 'mock' = geminiService.isMockMode() ? 'mock' : 'gemini';

    try {
      const memories = await memoryService.retrieveRelevantMemories(userId, task.description);
      const workspaceFiles = await workspaceService.listUserFiles(userId);
      const fileSummaries = workspaceFiles.map((f: any) => ({
        id: f.id,
        filename: f.filename,
        mimeType: f.mimeType,
      }));

      if (customPlan) {
        validatedPlan = executionPlanSchema.parse(customPlan) as ExecutionPlan;
      } else {
        const planResult = await geminiService.generateTaskPlan(
          task.description,
          fileSummaries,
          memories,
          {
            googleConnected: googleStatus.connected,
            telegramConnected: telegramStatus.connected,
            spreadsheetId,
          }
        );
        validatedPlan = executionPlanSchema.parse(planResult.plan) as ExecutionPlan;
        planningAiMode = planResult.aiMode;
      }

      if (validatedPlan.steps.length > MAX_STEPS_PER_TASK) {
        validatedPlan.steps = validatedPlan.steps.slice(0, MAX_STEPS_PER_TASK);
      }

      await prisma.agentExecution.update({
        where: { id: coordinatorExec.id },
        data: {
          output: { plan: validatedPlan, aiMode: planningAiMode } as any,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      await prisma.taskStep.deleteMany({ where: { taskId } });
      for (const step of validatedPlan.steps) {
        await prisma.taskStep.create({
          data: {
            taskId,
            agentType: step.agentType,
            description: step.description,
            sequence: step.sequence,
            status: 'pending',
            input: {
              requiredTools: step.requiredTools,
              toolArguments: step.toolArguments || {},
            } as any,
          },
        });
      }

      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'running',
          plan: validatedPlan as any,
        },
      });

      realtimeService.emitToUser(
        userId,
        'task.plan.created',
        { taskId, plan: validatedPlan },
        { conversationId: conversationId || undefined, taskId }
      );
    } catch (err: any) {
      await prisma.agentExecution.update({
        where: { id: coordinatorExec.id },
        data: {
          status: 'failed',
          error: err?.message || 'Coordinator planning failed',
          completedAt: new Date(),
        },
      });
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: 'failed',
          error: err?.message || 'Coordinator failed to create execution plan',
        },
      });
      if (conversationId) {
        await prisma.chatConversation.update({
          where: { id: conversationId },
          data: { status: 'failed' },
        });
        await this.appendConversationMessage(userId, conversationId, taskId, {
          senderType: 'system',
          senderName: 'Coordinator Agent',
          agentRole: 'coordinator',
          content: `Failed to plan task: ${err?.message || 'Unknown error'}`,
          metadata: { type: 'error', errorCode: err?.code },
        });
      }
      realtimeService.emitToUser(
        userId,
        'task.failed',
        { taskId, error: err?.message },
        { conversationId: conversationId || undefined, taskId }
      );
      throw err;
    }

    return this.runPendingTaskSteps(userId, taskId);
  }

  public async runPendingTaskSteps(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        steps: { orderBy: { sequence: 'asc' } },
      },
    });

    if (!task) {
      throw new AppError('Task not found', 404, 'TASK_NOT_FOUND');
    }

    const conversationId = task.conversationId;
    const memories = await memoryService.retrieveRelevantMemories(userId, task.description);
    const workspaceFiles = await workspaceService.listUserFiles(userId);
    const fileSummaries = workspaceFiles.map((f: any) => ({
      id: f.id,
      filename: f.filename,
      mimeType: f.mimeType,
    }));

    const previousOutputs: Array<{
      sequence: number;
      agentType: string;
      description: string;
      output: any;
    }> = [];

    const collectedArtifacts: Array<{
      fileId: string;
      filename: string;
      fileType: string;
      size: number;
      downloadUrl: string;
      externalUrl?: string;
      documentId?: string;
    }> = [];

    for (const dbStep of task.steps) {
      const freshTask = await prisma.task.findUnique({ where: { id: taskId } });
      if (freshTask?.status === 'cancelled') {
        return this.getTaskDetails(userId, taskId);
      }

      if (dbStep.status === 'completed') {
        previousOutputs.push({
          sequence: dbStep.sequence,
          agentType: dbStep.agentType,
          description: dbStep.description,
          output: dbStep.output,
        });
        const stepOut: any = dbStep.output;
        if (stepOut?.artifacts && Array.isArray(stepOut.artifacts)) {
          collectedArtifacts.push(...stepOut.artifacts);
        }
        continue;
      }

      if (dbStep.status === 'skipped') {
        continue;
      }

      await prisma.taskStep.update({
        where: { id: dbStep.id },
        data: {
          status: 'running',
          startedAt: new Date(),
        },
      });

      const stepInputConfig: any = dbStep.input || {};
      const plannedStep: PlannedStep = {
        sequence: dbStep.sequence,
        agentType: dbStep.agentType as any,
        description: dbStep.description,
        requiredTools: stepInputConfig.requiredTools || [],
        toolArguments: stepInputConfig.toolArguments || {},
      };

      const agentDisplayName = `${dbStep.agentType.charAt(0).toUpperCase() + dbStep.agentType.slice(1)} Agent`;

      let stepResult;
      let attempts = 0;

      while (attempts <= MAX_AGENT_RETRIES) {
        try {
          stepResult = await specialistAgentService.executeSpecialistStep(plannedStep, {
            userId,
            taskId,
            conversationId: conversationId || undefined,
            objective: task.description,
            stepDescription: dbStep.description,
            previousOutputs,
            toolResults: [],
            memories,
            workspaceFiles: fileSummaries,
          });
          break;
        } catch (err: any) {
          attempts += 1;
          if (
            err?.code === 'GEMINI_QUOTA_EXCEEDED' ||
            err?.code === 'UNKNOWN_TOOL_REJECTED' ||
            err?.code === 'TOOL_PERMISSION_DENIED' ||
            err?.code === 'FILE_NOT_FOUND' ||
            err?.code === 'GOOGLE_NOT_CONNECTED' ||
            err?.code === 'TELEGRAM_NOT_CONNECTED' ||
            err?.code === 'TELEGRAM_CHAT_NOT_LINKED' ||
            err?.code === 'SPREADSHEET_NOT_FOUND' ||
            attempts > MAX_AGENT_RETRIES
          ) {
            await prisma.taskStep.update({
              where: { id: dbStep.id },
              data: {
                status: 'failed',
                output: { error: err?.message || 'Step execution failed' } as any,
                completedAt: new Date(),
              },
            });

            await prisma.task.update({
              where: { id: taskId },
              data: {
                status: 'failed',
                error: err?.message || 'Task step failed',
              },
            });

            if (conversationId) {
              await prisma.chatConversation.update({
                where: { id: conversationId },
                data: { status: 'failed' },
              });
              await this.appendConversationMessage(userId, conversationId, taskId, {
                senderType: 'system',
                senderName: agentDisplayName,
                agentRole: dbStep.agentType,
                content: err?.message || 'Step execution failed',
                metadata: {
                  type: 'error_card',
                  errorCode: err?.code || 'STEP_FAILED',
                  agentType: dbStep.agentType,
                  stepSequence: dbStep.sequence,
                },
              });
            }

            realtimeService.emitToUser(
              userId,
              'task.failed',
              { taskId, error: err?.message },
              { conversationId: conversationId || undefined, taskId }
            );

            throw err;
          }
        }
      }

      if (!stepResult) {
        continue;
      }

      // Record tool execution cards in conversation if tools ran
      const ranTools: Array<{ toolName: string; output: any }> =
        stepResult.findings?.toolResults || [];
      if (conversationId) {
        for (const t of ranTools) {
          if (t.output?.approvalRequired) continue; // Handled by approval card below
          let toolLabel = t.toolName;
          let appName = 'Anavya Workspace';
          let actionLabel = `Executing ${t.toolName}`;
          let toolSummary = `Executed ${t.toolName} successfully.`;

          if (t.toolName === 'google_sheets.read') {
            toolLabel = 'Google Sheets';
            appName = 'Google Sheets';
            actionLabel = `Reading spreadsheet "${t.output?.title || t.output?.spreadsheetId}"`;
            toolSummary = `Read ${t.output?.rowCount ?? 0} rows from "${t.output?.title || t.output?.spreadsheetId}" successfully.`;
          } else if (t.toolName === 'google_sheets.list_spreadsheets') {
            toolLabel = 'Google Sheets';
            appName = 'Google Sheets';
            actionLabel = 'Listing accessible Google Spreadsheets';
            toolSummary = `Found ${(t.output?.spreadsheets || []).length} accessible spreadsheet(s).`;
          } else if (t.toolName === 'csv_analyzer') {
            toolLabel = 'Google Sheets';
            appName = 'Google Sheets';
            actionLabel = `Analyzing dataset "${t.output?.filename || 'sales.csv'}"`;
            toolSummary = `Read ${t.output?.rowCount ?? 0} rows. Calculated Grand Total Revenue: $${Number(t.output?.GrandTotalRevenue ?? 0).toFixed(2)}.`;
          } else if (t.toolName.startsWith('google_docs')) {
            toolLabel = 'Google Docs';
            appName = 'Google Docs';
            actionLabel = `Creating report "${t.output?.title || 'Document'}"`;
            toolSummary = `Document "${t.output?.title || t.output?.documentId}" created successfully.`;
          } else if (t.toolName.startsWith('google_drive')) {
            toolLabel = 'Google Drive';
            appName = 'Google Drive';
            actionLabel =
              t.toolName === 'google_drive.upload_file'
                ? `Uploading "${t.output?.name}" to Google Drive`
                : 'Searching Google Drive files';
            toolSummary =
              t.toolName === 'google_drive.upload_file'
                ? `Uploaded "${t.output?.name}" to Google Drive.`
                : `Found ${(t.output?.files || []).length} matching file(s) in Google Drive.`;
          } else if (t.toolName.startsWith('gmail')) {
            toolLabel = 'Gmail';
            appName = 'Gmail';
            actionLabel =
              t.toolName === 'gmail.create_draft'
                ? `Creating email draft to ${t.output?.recipient || 'recipient'}`
                : 'Reading Gmail inbox';
            toolSummary =
              t.toolName === 'gmail.create_draft'
                ? `Created Gmail draft "${t.output?.subject}" to ${t.output?.recipient}.`
                : `Retrieved ${(t.output?.messages || []).length} message(s) from Gmail.`;
          } else if (t.toolName === 'file_writer') {
            toolLabel = 'Google Docs';
            appName = 'Google Docs';
            actionLabel = `Generating document "${t.output?.filename}"`;
            toolSummary = `Saved "${t.output?.filename}" to workspace.`;
          } else if (t.toolName === 'web_research') {
            toolLabel = 'Anavya Research';
            appName = 'Anavya Workspace';
            actionLabel = 'Researching sources and market intelligence';
            toolSummary = 'Compiled structured research findings.';
          }

          await this.appendConversationMessage(userId, conversationId, taskId, {
            senderType: 'tool',
            senderName: toolLabel,
            agentRole: dbStep.agentType,
            content: toolSummary,
            metadata: {
              type: 'tool_result',
              toolName: t.toolName,
              toolLabel,
              appName,
              actionLabel,
              status: 'completed',
              output: t.output,
            },
          });
        }
      }

      if (stepResult.status === 'waiting_for_approval') {
        await prisma.taskStep.update({
          where: { id: dbStep.id },
          data: {
            status: 'waiting_for_approval',
            output: stepResult as any,
          },
        });

        await prisma.task.update({
          where: { id: taskId },
          data: {
            status: 'waiting_for_approval',
          },
        });

        if (conversationId) {
          await prisma.chatConversation.update({
            where: { id: conversationId },
            data: { status: 'waiting_for_approval' },
          });

          const approvalRecord = stepResult.approvalId
            ? await prisma.approval.findUnique({ where: { id: stepResult.approvalId } })
            : null;

          const approvalActionName = approvalRecord?.actionName || 'protected_action';
          const approvalAppName =
            approvalActionName === 'telegram.send_message'
              ? 'Telegram'
              : approvalActionName === 'gmail.send_message' || approvalActionName === 'send_email'
              ? 'Gmail'
              : approvalActionName.startsWith('google_sheets')
              ? 'Google Sheets'
              : 'Anavya Approval';

          await this.appendConversationMessage(userId, conversationId, taskId, {
            senderType: 'approval',
            senderName: approvalAppName,
            agentRole: dbStep.agentType,
            content: stepResult.summary,
            approvalId: stepResult.approvalId,
            metadata: {
              type: 'approval_card',
              appName: approvalAppName,
              approvalId: stepResult.approvalId,
              actionName: approvalActionName,
              actionArguments: approvalRecord?.actionArguments || {},
              status: 'pending',
            },
          });
        }

        return this.getTaskDetails(userId, taskId);
      }

      await prisma.taskStep.update({
        where: { id: dbStep.id },
        data: {
          status: 'completed',
          output: stepResult as any,
          completedAt: new Date(),
        },
      });

      if (conversationId) {
        await this.appendConversationMessage(userId, conversationId, taskId, {
          senderType: 'agent',
          senderName: agentDisplayName,
          agentRole: dbStep.agentType,
          content: stepResult.summary,
          metadata: {
            type: 'execution_card',
            agentType: dbStep.agentType,
            title: agentDisplayName,
            subtitle: dbStep.description,
            status: 'completed',
            artifacts: stepResult.artifacts || [],
          },
        });
      }

      previousOutputs.push({
        sequence: dbStep.sequence,
        agentType: dbStep.agentType,
        description: dbStep.description,
        output: stepResult,
      });

      if (stepResult.artifacts && stepResult.artifacts.length > 0) {
        collectedArtifacts.push(...stepResult.artifacts);
      }
    }

    const stepSummaries = previousOutputs.map((p) => ({
      agentType: p.agentType,
      summary: (p.output?.summary || '').slice(0, 500),
    }));

    const summaryRes = await geminiService.generateTaskSummary(
      task.description,
      stepSummaries,
      collectedArtifacts.map((a) => ({
        filename: a.filename,
        fileId: a.fileId,
        externalUrl: a.externalUrl,
      }))
    );

    const finalOutput = {
      summary: summaryRes.summary,
      aiMode: summaryRes.aiMode,
      artifacts: collectedArtifacts,
      stepResults: previousOutputs.map((p) => ({
        sequence: p.sequence,
        agentType: p.agentType,
        description: p.description,
        summary: p.output?.summary,
        artifacts: p.output?.artifacts || [],
      })),
    };

    await prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'completed',
        finalOutput: finalOutput as any,
        completedAt: new Date(),
      },
    });

    if (conversationId) {
      await prisma.chatConversation.update({
        where: { id: conversationId },
        data: { status: 'completed' },
      });

      await this.appendConversationMessage(userId, conversationId, taskId, {
        senderType: 'agent',
        senderName: 'Coordinator Agent',
        agentRole: 'coordinator',
        content: summaryRes.summary,
        metadata: {
          type: 'final_response',
          artifacts: collectedArtifacts,
          taskId,
        },
      });
    }

    await memoryService.createMemory(userId, 'task_summary', summaryRes.summary, {
      taskId,
      conversationId,
      artifacts: collectedArtifacts.map((a) => a.filename),
    });

    realtimeService.emitToUser(
      userId,
      'task.completed',
      { taskId, finalOutput },
      { conversationId: conversationId || undefined, taskId }
    );

    return this.getTaskDetails(userId, taskId);
  }

  public async getTaskDetails(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
      include: {
        steps: { orderBy: { sequence: 'asc' } },
        approvals: { orderBy: { createdAt: 'desc' } },
      },
    });

    if (!task) {
      throw new AppError('Task not found or access denied', 404, 'TASK_NOT_FOUND');
    }

    return task;
  }

  public async getTaskExecutions(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
    });
    if (!task) {
      throw new AppError('Task not found or access denied', 404, 'TASK_NOT_FOUND');
    }

    const [steps, agentExecutions, toolExecutions, approvals] = await Promise.all([
      prisma.taskStep.findMany({
        where: { taskId },
        orderBy: { sequence: 'asc' },
      }),
      prisma.agentExecution.findMany({
        where: { taskId },
        orderBy: { startedAt: 'asc' },
      }),
      prisma.toolExecution.findMany({
        where: { taskId },
        orderBy: { createdAt: 'asc' },
      }),
      prisma.approval.findMany({
        where: { taskId, userId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      taskId: task.id,
      status: task.status,
      steps,
      agentExecutions,
      toolExecutions,
      approvals,
    };
  }

  public async listUserTasks(userId: string, page = 1, limit = 20, status?: string) {
    const safePage = Math.max(1, page);
    const safeLimit = Math.min(100, Math.max(1, limit));
    const skip = (safePage - 1) * safeLimit;

    const where: any = { userId };
    if (status) {
      where.status = status;
    }

    const [items, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: safeLimit,
        include: {
          steps: { orderBy: { sequence: 'asc' } },
          approvals: true,
        },
      }),
      prisma.task.count({ where }),
    ]);

    return {
      items,
      pagination: {
        page: safePage,
        limit: safeLimit,
        total,
        totalPages: Math.ceil(total / safeLimit),
      },
    };
  }

  public async cancelTask(userId: string, taskId: string) {
    const task = await prisma.task.findFirst({
      where: { id: taskId, userId },
    });

    if (!task) {
      throw new AppError('Task not found or access denied', 404, 'TASK_NOT_FOUND');
    }

    if (task.status === 'completed' || task.status === 'failed' || task.status === 'cancelled') {
      throw new AppError(
        `Cannot cancel a task with status '${task.status}'`,
        400,
        'INVALID_TASK_STATE'
      );
    }

    await prisma.taskStep.updateMany({
      where: {
        taskId,
        status: { in: ['pending', 'running', 'waiting_for_approval'] },
      },
      data: {
        status: 'skipped',
        completedAt: new Date(),
      },
    });

    if (task.conversationId) {
      await prisma.chatConversation.update({
        where: { id: task.conversationId },
        data: { status: 'cancelled' },
      });
    }

    return prisma.task.update({
      where: { id: taskId },
      data: {
        status: 'cancelled',
        completedAt: new Date(),
      },
      include: {
        steps: { orderBy: { sequence: 'asc' } },
      },
    });
  }
}

export const orchestratorService = new OrchestratorService();
