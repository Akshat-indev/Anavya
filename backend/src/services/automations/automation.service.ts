import { prisma } from '../../config/db';
import { AppError } from '../../utils/errors';
import { ExecutionPlan } from '../../types';
import { orchestratorService } from '../orchestration/orchestrator.service';
import { workspaceService } from '../workspace/workspace.service';

export const PREDEFINED_SALES_AUTOMATION = {
  name: 'Sales Report Automation',
  description:
    'Analyze an uploaded sales CSV using deterministic CSV Analyzer, interpret performance with Analyst Agent, and generate a professional Markdown report in the workspace with Writer Agent.',
  workflowDefinition: {
    type: 'sales_report_automation',
    objectiveTemplate:
      'Analyze this sales CSV ({{filename}}). Calculate total revenue, identify the top five products, compare their performance, and generate a professional report.',
    steps: [
      {
        sequence: 1,
        agentType: 'analyst' as const,
        description:
          'Run CSV Analyzer on the uploaded sales CSV and interpret total revenue, top 5 products, and category comparisons',
        requiredTools: ['csv_analyzer'],
        toolArguments: { filename: 'sales.csv', topN: 5 },
      },
      {
        sequence: 2,
        agentType: 'writer' as const,
        description:
          'Generate a professional Markdown sales report based on Analyst findings and save it in the workspace',
        requiredTools: ['file_writer'],
        toolArguments: { filename: 'automated_sales_report.md', fileType: 'md' },
      },
    ],
  },
};

export class AutomationService {
  public async ensurePredefinedAutomations(userId: string) {
    const existing = await prisma.automation.findFirst({
      where: { userId, name: PREDEFINED_SALES_AUTOMATION.name },
    });

    if (!existing) {
      await prisma.automation.create({
        data: {
          userId,
          name: PREDEFINED_SALES_AUTOMATION.name,
          description: PREDEFINED_SALES_AUTOMATION.description,
          workflowDefinition: PREDEFINED_SALES_AUTOMATION.workflowDefinition as any,
        },
      });
    }
  }

  public async listAutomations(userId: string) {
    await this.ensurePredefinedAutomations(userId);
    const automations = await prisma.automation.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
    });

    return automations.map((a: any) => ({
      ...a,
      lastExecutedAt: a.executions[0]?.createdAt || null,
    }));
  }

  public async createAutomation(
    userId: string,
    input: {
      name: string;
      description: string;
      workflowDefinition: any;
    }
  ) {
    return prisma.automation.create({
      data: {
        userId,
        name: input.name,
        description: input.description,
        workflowDefinition: input.workflowDefinition,
      },
    });
  }

  public async getAutomationById(userId: string, automationId: string) {
    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId },
      include: {
        executions: {
          orderBy: { createdAt: 'desc' },
          take: 10,
        },
      },
    });

    if (!automation) {
      throw new AppError('Automation not found or access denied', 404, 'AUTOMATION_NOT_FOUND');
    }

    return {
      ...automation,
      lastExecutedAt: automation.executions[0]?.createdAt || null,
    };
  }

  public async runAutomation(
    userId: string,
    automationId: string,
    options?: { fileId?: string; filename?: string; parameters?: Record<string, any> }
  ) {
    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId },
    });

    if (!automation) {
      throw new AppError('Automation not found or access denied', 404, 'AUTOMATION_NOT_FOUND');
    }

    let resolvedFilename = options?.filename;
    if (options?.fileId) {
      const file = await workspaceService.getFileById(userId, options.fileId);
      resolvedFilename = file.filename;
    }

    if (!resolvedFilename) {
      const userFiles = await workspaceService.listUserFiles(userId);
      const latestCsv = userFiles.find((f: any) => f.filename.toLowerCase().endsWith('.csv'));
      resolvedFilename = latestCsv ? latestCsv.filename : 'sales.csv';
    }

    const wfDef: any = automation.workflowDefinition || {};
    const objectiveTemplate =
      wfDef.objectiveTemplate || `Execute automation: ${automation.name} on ${resolvedFilename}`;
    const objective = objectiveTemplate.replace('{{filename}}', resolvedFilename);

    let customPlan: ExecutionPlan | undefined;
    if (Array.isArray(wfDef.steps) && wfDef.steps.length > 0) {
      customPlan = {
        objectiveSummary: `Reusable Automation Execution: ${automation.name}`,
        workType: 'data_analysis',
        steps: wfDef.steps.map((s: any) => ({
          ...s,
          toolArguments: {
            ...(s.toolArguments || {}),
            ...(s.requiredTools?.includes('csv_analyzer') ? { filename: resolvedFilename } : {}),
          },
        })),
      };
    }

    const task = await orchestratorService.createAndRunTask(userId, {
      title: `[Automation] ${automation.name}`,
      description: objective,
      customPlan,
    });

    const execution = await prisma.automationExecution.create({
      data: {
        automationId: automation.id,
        taskId: task.id,
        status: task.status,
        output: task.finalOutput as any,
        completedAt: task.completedAt || new Date(),
      },
    });

    await prisma.automation.update({
      where: { id: automation.id },
      data: { updatedAt: new Date() },
    });

    return {
      automationExecution: execution,
      task,
    };
  }

  public async getAutomationExecutions(userId: string, automationId: string) {
    const automation = await prisma.automation.findFirst({
      where: { id: automationId, userId },
    });

    if (!automation) {
      throw new AppError('Automation not found or access denied', 404, 'AUTOMATION_NOT_FOUND');
    }

    return prisma.automationExecution.findMany({
      where: { automationId: automation.id },
      orderBy: { createdAt: 'desc' },
      include: {
        task: {
          select: {
            id: true,
            title: true,
            status: true,
            finalOutput: true,
            createdAt: true,
            completedAt: true,
          },
        },
      },
    });
  }
}

export const automationService = new AutomationService();
