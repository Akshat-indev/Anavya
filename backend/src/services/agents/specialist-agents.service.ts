import { prisma } from '../../config/db';
import {
  AgentExecutionContext,
  AgentResult,
  AgentRole,
  PlannedStep,
} from '../../types';
import { geminiService } from '../ai/gemini.service';
import { toolRegistryService } from '../tools/tool-registry.service';
import { realtimeService } from '../realtime/realtime.service';
import { AppError } from '../../utils/errors';

const SIMPLE_NAME_POOL = [
  'Aarav Mehta',
  'Amelia Brooks',
  'Daniel Carter',
  'Elena Rossi',
  'Ibrahim Khan',
  'Liam Foster',
  'Maya Patel',
  'Noah Bennett',
  'Sofia Nguyen',
  'Theo Morgan',
  'Zara Williams',
  'Jonas Reed',
];

function createSimpleNamesDocument(objective: string): string | null {
  const lower = objective.toLowerCase();
  if (
    !/\b(random|list|names?)\b/.test(lower) ||
    /\b(report|summary|analysis|executive|professional|formal)\b/.test(lower)
  ) {
    return null;
  }

  const countMatch = lower.match(/\b(\d+)\s+names?\b/);
  const count = Math.min(Math.max(Number(countMatch?.[1] || 10), 1), 50);
  const names = [...SIMPLE_NAME_POOL];
  for (let i = names.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [names[i], names[j]] = [names[j], names[i]];
  }
  while (names.length < count) {
    names.push(`Name ${names.length + 1}`);
  }
  return `# Names\n\n${names.slice(0, count).join('\n\n')}`;
}

export interface AgentConfigurationSpec {
  name: string;
  role: AgentRole;
  description: string;
  category: string;
  avatar: string;
  accentColor: string;
  intro: string;
  personality: string;
  systemInstructions: string;
  enabledTools: string[];
  actionPermissions: {
    allowReadOnly: boolean;
    allowDocCreation: boolean;
    allowSheetModification: boolean;
    allowEmailDrafting: boolean;
    allowEmailSending: boolean;
    allowTelegramMessaging: boolean;
    requireApproval: boolean;
  };
  executionBehavior: {
    maxSteps: number;
    maxRetries: number;
    timeoutSec: number;
    canDelegate: boolean;
    requireApproval: boolean;
    canCollaborate: boolean;
    saveToMemory: boolean;
  };
  outputPreferences: {
    responseLength: 'concise' | 'balanced' | 'detailed';
    outputFormat: 'markdown' | 'bullet_points' | 'executive_report' | 'json' | 'code_first';
    tone: string;
    formattingPreferences: string;
    requireSummaries: boolean;
    requireCitations: boolean;
  };
  memorySettings: {
    useConversationContext: boolean;
    useUserPreferences: boolean;
    saveTaskSummaries: boolean;
    saveReusableKnowledge: boolean;
    disableMemory: boolean;
  };
  isSystem: boolean;
}

export const DEFAULT_AGENT_DEFINITIONS: AgentConfigurationSpec[] = [
  {
    name: 'Coordinator Agent',
    role: 'coordinator',
    description:
      'Lead orchestrator that interprets complex objectives, creates multi-step execution plans, delegates subtasks to specialists, and synthesizes final outcomes.',
    category: 'Operations',
    avatar: 'coordinator',
    accentColor: '#F59E0B',
    intro: 'I coordinate specialist agents and external tools to get your work done end-to-end.',
    personality: 'Professional',
    systemInstructions:
      'You are the Coordinator Agent for Anavya. Understand the user objective, create a structured execution plan, delegate subtasks to specialist agents, track dependencies, handle recoverable errors, and synthesize final results.',
    enabledTools: [
      'web_research',
      'file_reader',
      'file_writer',
      'csv_analyzer',
      'google_drive.list_files',
      'google_drive.search_files',
      'google_drive.get_file_metadata',
      'google_sheets.list_spreadsheets',
      'google_sheets.read',
      'google_docs.create_document',
      'gmail.list_messages',
      'gmail.search_messages',
      'gmail.create_draft',
      'gmail.send_message',
      'telegram.send_message',
      'approval_protected_action',
    ],
    actionPermissions: {
      allowReadOnly: true,
      allowDocCreation: true,
      allowSheetModification: true,
      allowEmailDrafting: true,
      allowEmailSending: true,
      allowTelegramMessaging: true,
      requireApproval: true,
    },
    executionBehavior: {
      maxSteps: 6,
      maxRetries: 1,
      timeoutSec: 60,
      canDelegate: true,
      requireApproval: true,
      canCollaborate: true,
      saveToMemory: true,
    },
    outputPreferences: {
      responseLength: 'balanced',
      outputFormat: 'markdown',
      tone: 'Executive & clear',
      formattingPreferences: 'Structured sections with clear action items and links',
      requireSummaries: true,
      requireCitations: true,
    },
    memorySettings: {
      useConversationContext: true,
      useUserPreferences: true,
      saveTaskSummaries: true,
      saveReusableKnowledge: true,
      disableMemory: false,
    },
    isSystem: true,
  },
  {
    name: 'Researcher Agent',
    role: 'researcher',
    description:
      'Deep research specialist that gathers intelligence across web sources, Google Drive files, Docs, and Gmail threads with verified citations.',
    category: 'Research',
    avatar: 'researcher',
    accentColor: '#14B8A6',
    intro: 'I investigate markets, documents, and threads to surface verified insights.',
    personality: 'Analytical',
    systemInstructions:
      'You are the Researcher Agent for Anavya. Research topics using permitted research tools, Google Drive files, and Gmail messages. Summarize relevant information, organize findings, and include source URLs when available. Never fabricate sources or search results.',
    enabledTools: [
      'web_research',
      'file_reader',
      'google_drive.list_files',
      'google_drive.search_files',
      'google_drive.get_file_metadata',
      'google_drive.download_file',
      'google_docs.read_document',
      'gmail.list_messages',
      'gmail.search_messages',
      'gmail.get_message',
      'gmail.get_thread',
    ],
    actionPermissions: {
      allowReadOnly: true,
      allowDocCreation: false,
      allowSheetModification: false,
      allowEmailDrafting: false,
      allowEmailSending: false,
      allowTelegramMessaging: false,
      requireApproval: true,
    },
    executionBehavior: {
      maxSteps: 5,
      maxRetries: 1,
      timeoutSec: 45,
      canDelegate: false,
      requireApproval: true,
      canCollaborate: true,
      saveToMemory: true,
    },
    outputPreferences: {
      responseLength: 'detailed',
      outputFormat: 'markdown',
      tone: 'Objective & evidence-based',
      formattingPreferences: 'Include key findings, comparison tables, and source links',
      requireSummaries: true,
      requireCitations: true,
    },
    memorySettings: {
      useConversationContext: true,
      useUserPreferences: true,
      saveTaskSummaries: true,
      saveReusableKnowledge: true,
      disableMemory: false,
    },
    isSystem: true,
  },
  {
    name: 'Analyst Agent',
    role: 'analyst',
    description:
      'Quantitative data specialist that inspects Google Sheets and CSV datasets to compute totals, averages, top-N rankings, and category trends.',
    category: 'Data and Analytics',
    avatar: 'analyst',
    accentColor: '#3B82F6',
    intro: 'I run deterministic calculations on your spreadsheets and financial datasets.',
    personality: 'Analytical',
    systemInstructions:
      'You are the Analyst Agent for Anavya. Analyze CSV and Google Sheets data using deterministic tools, review totals, averages, rankings, and comparisons, identify trends, and explain important results clearly.',
    enabledTools: [
      'csv_analyzer',
      'file_reader',
      'google_drive.list_files',
      'google_drive.search_files',
      'google_sheets.create_spreadsheet',
      'google_sheets.list_spreadsheets',
      'google_sheets.read',
      'google_sheets.append_rows',
      'google_sheets.update_range',
    ],
    actionPermissions: {
      allowReadOnly: true,
      allowDocCreation: false,
      allowSheetModification: true,
      allowEmailDrafting: false,
      allowEmailSending: false,
      allowTelegramMessaging: false,
      requireApproval: true,
    },
    executionBehavior: {
      maxSteps: 5,
      maxRetries: 1,
      timeoutSec: 45,
      canDelegate: false,
      requireApproval: true,
      canCollaborate: true,
      saveToMemory: true,
    },
    outputPreferences: {
      responseLength: 'balanced',
      outputFormat: 'markdown',
      tone: 'Precise & data-driven',
      formattingPreferences: 'Highlight exact revenue figures, percentages, and ranked tables',
      requireSummaries: true,
      requireCitations: false,
    },
    memorySettings: {
      useConversationContext: true,
      useUserPreferences: true,
      saveTaskSummaries: true,
      saveReusableKnowledge: true,
      disableMemory: false,
    },
    isSystem: true,
  },
  {
    name: 'Writer Agent',
    role: 'writer',
    description:
      'Executive communications and document specialist that crafts polished Google Docs reports, Gmail drafts, and Telegram updates.',
    category: 'Writing',
    avatar: 'writer',
    accentColor: '#A855F7',
    intro: 'I turn analytical findings into executive Google Docs, email sequences, and updates.',
    personality: 'Professional',
    systemInstructions:
      'You are the Writer Agent for Anavya. Generate professional Markdown reports, Google Docs documents, executive summaries, Gmail drafts/messages, and Telegram notifications based on actual findings from Researcher and Analyst agents.',
    enabledTools: [
      'file_writer',
      'file_reader',
      'google_drive.upload_file',
      'google_drive.get_file_link',
      'google_docs.create_document',
      'google_docs.append_content',
      'google_docs.update_content',
      'google_sheets.create_spreadsheet',
      'gmail.create_draft',
      'gmail.send_message',
      'telegram.send_message',
      'approval_protected_action',
    ],
    actionPermissions: {
      allowReadOnly: true,
      allowDocCreation: true,
      allowSheetModification: false,
      allowEmailDrafting: true,
      allowEmailSending: true,
      allowTelegramMessaging: true,
      requireApproval: true,
    },
    executionBehavior: {
      maxSteps: 5,
      maxRetries: 1,
      timeoutSec: 60,
      canDelegate: false,
      requireApproval: true,
      canCollaborate: true,
      saveToMemory: true,
    },
    outputPreferences: {
      responseLength: 'detailed',
      outputFormat: 'executive_report',
      tone: 'Polished & executive',
      formattingPreferences: 'Executive summary first, followed by structured tables and takeaways',
      requireSummaries: true,
      requireCitations: true,
    },
    memorySettings: {
      useConversationContext: true,
      useUserPreferences: true,
      saveTaskSummaries: true,
      saveReusableKnowledge: false,
      disableMemory: false,
    },
    isSystem: true,
  },
  {
    name: 'Developer Agent',
    role: 'developer',
    description:
      'Technical architect and software engineer that designs specifications, writes clean code modules, and produces technical documentation.',
    category: 'Development',
    avatar: 'developer',
    accentColor: '#10B981',
    intro: 'I design software architecture, write clean code, and generate technical specs.',
    personality: 'Technical',
    systemInstructions:
      'You are the Developer Agent for Anavya. Analyze technical requirements, produce implementation plans, write clean code snippets and technical documentation, and save generated artifacts.',
    enabledTools: [
      'file_reader',
      'file_writer',
      'google_drive.list_files',
      'google_drive.upload_file',
      'google_docs.create_document',
      'approval_protected_action',
    ],
    actionPermissions: {
      allowReadOnly: true,
      allowDocCreation: true,
      allowSheetModification: false,
      allowEmailDrafting: false,
      allowEmailSending: false,
      allowTelegramMessaging: false,
      requireApproval: true,
    },
    executionBehavior: {
      maxSteps: 5,
      maxRetries: 1,
      timeoutSec: 60,
      canDelegate: false,
      requireApproval: true,
      canCollaborate: true,
      saveToMemory: true,
    },
    outputPreferences: {
      responseLength: 'detailed',
      outputFormat: 'code_first',
      tone: 'Technical & concise',
      formattingPreferences: 'Fenced code blocks with architecture diagrams and edge-case notes',
      requireSummaries: true,
      requireCitations: false,
    },
    memorySettings: {
      useConversationContext: true,
      useUserPreferences: true,
      saveTaskSummaries: true,
      saveReusableKnowledge: true,
      disableMemory: false,
    },
    isSystem: true,
  },
];

export class SpecialistAgentService {
  public async ensureUserDefaultAgents(userId: string) {
    const existing = await prisma.agent.findMany({ where: { userId } });
    if (existing.length > 0) {
      return existing;
    }
    await prisma.agent.createMany({
      data: DEFAULT_AGENT_DEFINITIONS.map((def) => ({
        userId,
        name: def.name,
        role: def.role,
        description: def.description,
        category: def.category,
        avatar: def.avatar,
        accentColor: def.accentColor,
        intro: def.intro,
        personality: def.personality,
        systemInstructions: def.systemInstructions,
        enabledTools: def.enabledTools as any,
        actionPermissions: def.actionPermissions as any,
        executionBehavior: def.executionBehavior as any,
        outputPreferences: def.outputPreferences as any,
        memorySettings: def.memorySettings as any,
        isSystem: true,
        isDraft: false,
        isActive: true,
      })),
    });
    return prisma.agent.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } });
  }

  public async getActiveAgentForRole(userId: string, role: AgentRole) {
    await this.ensureUserDefaultAgents(userId);
    const customAgent = await prisma.agent.findFirst({
      where: { userId, role, isActive: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (customAgent) {
      return customAgent;
    }
    const def = DEFAULT_AGENT_DEFINITIONS.find((d) => d.role === role) || DEFAULT_AGENT_DEFINITIONS[0];
    return def;
  }

  public async getAgentInstructions(userId: string, role: AgentRole): Promise<string> {
    const agent: any = await this.getActiveAgentForRole(userId, role);
    const baseInstructions = agent.systemInstructions || 'You are a specialist AI agent.';
    const personality = agent.personality ? `\nPersonality Style: ${agent.personality}.` : '';
    const outPrefs = agent.outputPreferences
      ? `\nOutput Format Preferences: Length=${agent.outputPreferences.responseLength || 'balanced'}, Format=${agent.outputPreferences.outputFormat || 'markdown'}, Tone=${agent.outputPreferences.tone || 'Professional'}.`
      : '';
    return `${baseInstructions}${personality}${outPrefs}`;
  }

  public checkToolPermission(
    agent: any,
    toolName: string
  ): { allowed: boolean; reason?: string } {
    const perms = agent?.actionPermissions || {};
    const enabledTools: string[] = Array.isArray(agent?.enabledTools) ? agent.enabledTools : [];

    // If custom agent explicitly disabled a tool and it's not a core read fallback
    if (enabledTools.length > 0 && !enabledTools.includes(toolName)) {
      // Check action permission overrides
      if (toolName.startsWith('google_docs.create') && perms.allowDocCreation === false) {
        return { allowed: false, reason: `Agent "${agent.name}" does not have Document Creation permission.` };
      }
      if (
        (toolName === 'google_sheets.append_rows' || toolName === 'google_sheets.update_range') &&
        perms.allowSheetModification === false
      ) {
        return { allowed: false, reason: `Agent "${agent.name}" does not have Spreadsheet Modification permission.` };
      }
      if (toolName === 'gmail.create_draft' && perms.allowEmailDrafting === false) {
        return { allowed: false, reason: `Agent "${agent.name}" does not have Email Drafting permission.` };
      }
      if (toolName === 'gmail.send_message' && perms.allowEmailSending === false) {
        return { allowed: false, reason: `Agent "${agent.name}" does not have Email Sending permission.` };
      }
      if (toolName === 'telegram.send_message' && perms.allowTelegramMessaging === false) {
        return { allowed: false, reason: `Agent "${agent.name}" does not have Telegram Messaging permission.` };
      }
    }

    return { allowed: true };
  }

  public async testAgent(
    userId: string,
    payload: {
      agentId?: string;
      name?: string;
      role?: AgentRole;
      personality?: string;
      systemInstructions?: string;
      enabledTools?: string[];
      actionPermissions?: Record<string, any>;
      outputPreferences?: Record<string, any>;
      sampleInstruction: string;
    }
  ) {
    const startTime = Date.now();
    let agentConfig: any = null;

    if (payload.agentId) {
      agentConfig = await prisma.agent.findFirst({
        where: { id: payload.agentId, userId },
      });
    }

    const role: AgentRole = payload.role || agentConfig?.role || 'researcher';
    const defaultSpec =
      DEFAULT_AGENT_DEFINITIONS.find((d) => d.role === role) || DEFAULT_AGENT_DEFINITIONS[0];

    const mergedAgent = {
      name: payload.name || agentConfig?.name || defaultSpec.name,
      role,
      personality: payload.personality || agentConfig?.personality || defaultSpec.personality,
      systemInstructions:
        payload.systemInstructions ||
        agentConfig?.systemInstructions ||
        defaultSpec.systemInstructions,
      enabledTools:
        payload.enabledTools ||
        (Array.isArray(agentConfig?.enabledTools) ? agentConfig.enabledTools : defaultSpec.enabledTools),
      actionPermissions:
        payload.actionPermissions ||
        agentConfig?.actionPermissions ||
        defaultSpec.actionPermissions,
      outputPreferences:
        payload.outputPreferences ||
        agentConfig?.outputPreferences ||
        defaultSpec.outputPreferences,
    };

    const lower = payload.sampleInstruction.toLowerCase();
    const candidateTools: string[] = [];

    if (lower.includes('sheet') || lower.includes('spreadsheet') || lower.includes('sales') || lower.includes('revenue')) {
      candidateTools.push('google_sheets.read', 'csv_analyzer');
    }
    if (lower.includes('drive') || lower.includes('find file') || lower.includes('folder')) {
      candidateTools.push('google_drive.search_files');
    }
    if (lower.includes('google doc') || lower.includes('report') || lower.includes('document')) {
      candidateTools.push('google_docs.create_document');
    }
    if (lower.includes('email') || lower.includes('gmail')) {
      if (lower.includes('send')) {
        candidateTools.push('gmail.send_message');
      } else {
        candidateTools.push('gmail.create_draft');
      }
    }
    if (lower.includes('telegram') || lower.includes('notify')) {
      candidateTools.push('telegram.send_message');
    }
    if (candidateTools.length === 0) {
      if (role === 'analyst') candidateTools.push('csv_analyzer');
      else if (role === 'writer') candidateTools.push('google_docs.create_document');
      else if (role === 'developer') candidateTools.push('file_writer');
      else candidateTools.push('web_research');
    }

    const selectedTools: Array<{
      toolName: string;
      appName: string;
      status: 'allowed' | 'blocked_by_permission' | 'requires_approval';
      reason?: string;
    }> = [];

    const permissionIssues: string[] = [];

    for (const tool of candidateTools) {
      const appName = tool.startsWith('google_sheets')
        ? 'Google Sheets'
        : tool.startsWith('google_docs')
        ? 'Google Docs'
        : tool.startsWith('google_drive')
        ? 'Google Drive'
        : tool.startsWith('gmail')
        ? 'Gmail'
        : tool.startsWith('telegram')
        ? 'Telegram'
        : 'Anavya Workspace';

      const enabled = mergedAgent.enabledTools.includes(tool);
      const permCheck = this.checkToolPermission(mergedAgent, tool);

      if (!enabled || !permCheck.allowed) {
        const reason =
          permCheck.reason ||
          `Tool "${tool}" (${appName}) is currently unchecked in ${mergedAgent.name}'s Tool Permissions.`;
        selectedTools.push({
          toolName: tool,
          appName,
          status: 'blocked_by_permission',
          reason,
        });
        permissionIssues.push(reason);
      } else if (
        tool === 'gmail.send_message' ||
        tool === 'telegram.send_message' ||
        tool === 'google_sheets.append_rows' ||
        tool === 'google_sheets.update_range'
      ) {
        selectedTools.push({
          toolName: tool,
          appName,
          status: 'requires_approval',
          reason: `${appName} external action will pause for human approval before executing.`,
        });
      } else {
        selectedTools.push({
          toolName: tool,
          appName,
          status: 'allowed',
        });
      }
    }

    const fullSystemPrompt = `${mergedAgent.systemInstructions}\nPersonality: ${mergedAgent.personality}\nOutput Preferences: ${JSON.stringify(mergedAgent.outputPreferences)}`;
    const aiResponse = await geminiService.executeAgentPrompt(role, fullSystemPrompt, {
      userId,
      taskId: 'studio_test_run',
      objective: payload.sampleInstruction,
      stepDescription: `Test run for ${mergedAgent.name} (${role})`,
      previousOutputs: [],
      toolResults: [],
      memories: [],
      workspaceFiles: [],
    });

    return {
      agentName: mergedAgent.name,
      role: mergedAgent.role,
      personality: mergedAgent.personality,
      sampleInstruction: payload.sampleInstruction,
      status: permissionIssues.length > 0 ? 'completed_with_permission_warnings' : 'completed',
      response: aiResponse.text,
      aiMode: aiResponse.aiMode,
      selectedTools,
      permissionIssues,
      durationMs: Date.now() - startTime,
    };
  }

  public async executeSpecialistStep(
    step: PlannedStep,
    context: AgentExecutionContext
  ): Promise<AgentResult> {
    const agentRole = step.agentType;
    const activeAgent: any = await this.getActiveAgentForRole(context.userId, agentRole);
    const systemInstructions = await this.getAgentInstructions(context.userId, agentRole);

    const executionRecord = await prisma.agentExecution.create({
      data: {
        taskId: context.taskId,
        agentType: agentRole,
        input: {
          stepDescription: step.description,
          requiredTools: step.requiredTools,
          previousOutputsCount: context.previousOutputs.length,
        },
        status: 'running',
      },
    });

    realtimeService.emitToUser(
      context.userId,
      'agent.execution.started',
      {
        agentExecutionId: executionRecord.id,
        agentType: agentRole,
        description: step.description,
        requiredTools: step.requiredTools,
      },
      { conversationId: context.conversationId, taskId: context.taskId }
    );

    try {
      const toolResults: Array<{ toolName: string; output: any }> = [];
      const artifacts: Array<{
        fileId: string;
        filename: string;
        fileType: string;
        size: number;
        downloadUrl: string;
        externalUrl?: string;
        documentId?: string;
      }> = [];

      const postGenerationTools = new Set([
        'file_writer',
        'google_docs.create_document',
        'google_docs.append_content',
        'google_docs.update_content',
        'google_drive.upload_file',
        'google_sheets.create_spreadsheet',
        'gmail.create_draft',
        'gmail.send_message',
        'approval_protected_action',
        'telegram.send_message',
        'google_sheets.append_rows',
        'google_sheets.update_range',
      ]);

      // 1. Execute pre-computation/read tools BEFORE reasoning
      for (const toolName of step.requiredTools) {
        const perm = this.checkToolPermission(activeAgent, toolName);
        if (!perm.allowed) {
          throw new AppError(perm.reason || 'Tool permission denied', 403, 'TOOL_PERMISSION_DENIED');
        }

        if (postGenerationTools.has(toolName)) {
          continue;
        }

        const toolArgs: Record<string, any> = { ...(step.toolArguments || {}) };

        if (toolName === 'csv_analyzer' || toolName === 'file_reader') {
          if (!toolArgs.filename) {
            const candidate = context.workspaceFiles.find((f) =>
              toolName === 'csv_analyzer' ? f.filename.endsWith('.csv') : true
            );
            toolArgs.filename = candidate ? candidate.filename : 'sales.csv';
          }
        }

        if (
          (toolName === 'web_research' ||
            toolName === 'google_drive.search_files' ||
            toolName === 'gmail.search_messages') &&
          !toolArgs.query
        ) {
          toolArgs.query = context.objective;
        }

        const toolOutput = await toolRegistryService.executeTool(toolName, toolArgs, {
          userId: context.userId,
          taskId: context.taskId,
          conversationId: context.conversationId,
          agentType: agentRole,
        });

        toolResults.push({ toolName, output: toolOutput });
      }

      const enrichedContext: AgentExecutionContext = {
        ...context,
        toolResults,
      };

      // 2. Check if this step requires an approval-gated tool
      if (
        step.requiredTools.includes('approval_protected_action') ||
        step.requiredTools.includes('telegram.send_message') ||
        step.requiredTools.includes('gmail.send_message') ||
        step.requiredTools.includes('google_sheets.append_rows') ||
        step.requiredTools.includes('google_sheets.update_range')
      ) {
        const prevOutputObj = context.previousOutputs[context.previousOutputs.length - 1]?.output;
        const prevDocUrl =
          prevOutputObj?.artifacts?.find((a: any) => a.externalUrl)?.externalUrl || '';
        const prevSummary = prevOutputObj?.summary || '';

        if (step.requiredTools.includes('telegram.send_message')) {
          let textDraft = step.toolArguments?.text || '';
          if (!textDraft && !prevSummary && !geminiService.isMockMode()) {
            const generated = await geminiService.executeAgentPrompt(
              agentRole,
              systemInstructions,
              enrichedContext
            );
            textDraft = generated.text.slice(0, 1200);
          } else if (!textDraft) {
            textDraft = prevSummary
              ? `${prevSummary.slice(0, 600)}${prevDocUrl ? `\n\nView Document: ${prevDocUrl}` : ''}`
              : 'Your task update is ready.';
          } else if (prevDocUrl && !textDraft.includes(prevDocUrl)) {
            textDraft = `${textDraft}\n\nLink: ${prevDocUrl}`;
          }

          const approvalOutput = await toolRegistryService.executeTool(
            'telegram.send_message',
            {
              text: textDraft,
              chatId: step.toolArguments?.chatId,
            },
            {
              userId: context.userId,
              taskId: context.taskId,
              conversationId: context.conversationId,
              agentType: agentRole,
            }
          );

          toolResults.push({ toolName: 'telegram.send_message', output: approvalOutput });

          const result: AgentResult = {
            agentType: agentRole,
            status: 'waiting_for_approval',
            summary: approvalOutput.message,
            findings: { approvalOutput, bodyDraft: textDraft },
            approvalId: approvalOutput.approvalId,
            aiMode: geminiService.isMockMode() ? 'mock' : 'gemini',
          };

          await prisma.agentExecution.update({
            where: { id: executionRecord.id },
            data: {
              output: result as any,
              status: 'waiting_for_approval',
              completedAt: new Date(),
            },
          });

          return result;
        }

        if (step.requiredTools.includes('gmail.send_message')) {
          const emailMatch = context.objective.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
          const recipient =
            step.toolArguments?.recipient || emailMatch?.[1] || 'client@example.com';

          let subject = step.toolArguments?.subject || '';
          let bodyDraft = step.toolArguments?.body || '';

          const isGenericPlaceholder =
            !bodyDraft ||
            bodyDraft === 'Your executive analysis report is ready in Anavya.' ||
            subject === 'Anavya Executive Summary Report' ||
            subject === 'Anavya Executive Summary & Report';

          if (isGenericPlaceholder && !geminiService.isMockMode()) {
            const generatedEmail = await geminiService.generateEmailDraft(
              context.objective,
              recipient,
              prevSummary
            );
            subject = generatedEmail.subject;
            bodyDraft =
              generatedEmail.body +
              (prevDocUrl && !generatedEmail.body.includes(prevDocUrl)
                ? `\n\nDocument Link: ${prevDocUrl}`
                : '');
          } else {
            subject = subject || 'Anavya Executive Summary & Report';
            bodyDraft =
              bodyDraft ||
              `${prevSummary || 'Your executive analysis report is ready in Anavya.'}${prevDocUrl ? `\n\nGoogle Docs Report Link: ${prevDocUrl}` : ''}`;
          }

          const approvalOutput = await toolRegistryService.executeTool(
            'gmail.send_message',
            {
              recipient,
              subject,
              body: bodyDraft,
            },
            {
              userId: context.userId,
              taskId: context.taskId,
              conversationId: context.conversationId,
              agentType: agentRole,
            }
          );

          toolResults.push({ toolName: 'gmail.send_message', output: approvalOutput });

          const result: AgentResult = {
            agentType: agentRole,
            status: 'waiting_for_approval',
            summary: approvalOutput.message,
            findings: { approvalOutput, recipient, subject, bodyDraft },
            approvalId: approvalOutput.approvalId,
            aiMode: geminiService.isMockMode() ? 'mock' : 'gemini',
          };

          await prisma.agentExecution.update({
            where: { id: executionRecord.id },
            data: {
              output: result as any,
              status: 'waiting_for_approval',
              completedAt: new Date(),
            },
          });

          return result;
        }

        if (
          step.requiredTools.includes('google_sheets.append_rows') ||
          step.requiredTools.includes('google_sheets.update_range')
        ) {
          const sheetTool = step.requiredTools.includes('google_sheets.append_rows')
            ? 'google_sheets.append_rows'
            : 'google_sheets.update_range';

          let valuesToUse = step.toolArguments?.values;
          if ((!Array.isArray(valuesToUse) || valuesToUse.length === 0) && !geminiService.isMockMode()) {
            const generatedTable = await geminiService.generateSpreadsheetTable(
              context.objective,
              prevSummary
            );
            valuesToUse = generatedTable.values;
          }

          const approvalOutput = await toolRegistryService.executeTool(
            sheetTool,
            {
              spreadsheetId: step.toolArguments?.spreadsheetId || 'latest',
              range: step.toolArguments?.range || 'Sheet1!A1',
              values: valuesToUse || [['Summary', (prevSummary || context.objective).slice(0, 120)]],
            },
            {
              userId: context.userId,
              taskId: context.taskId,
              conversationId: context.conversationId,
              agentType: agentRole,
            }
          );

          toolResults.push({ toolName: sheetTool, output: approvalOutput });

          const result: AgentResult = {
            agentType: agentRole,
            status: 'waiting_for_approval',
            summary: approvalOutput.message,
            findings: { approvalOutput },
            approvalId: approvalOutput.approvalId,
            aiMode: geminiService.isMockMode() ? 'mock' : 'gemini',
          };

          await prisma.agentExecution.update({
            where: { id: executionRecord.id },
            data: {
              output: result as any,
              status: 'waiting_for_approval',
              completedAt: new Date(),
            },
          });

          return result;
        }

        const emailMatch = context.objective.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        const recipient = step.toolArguments?.recipient || emailMatch?.[1] || 'client@example.com';
        let subject = step.toolArguments?.subject || '';
        let bodyDraft = step.toolArguments?.bodyDraft || prevSummary || '';

        if ((!bodyDraft || subject === 'Executive Summary Report') && !geminiService.isMockMode()) {
          const generatedEmail = await geminiService.generateEmailDraft(
            context.objective,
            recipient,
            prevSummary
          );
          subject = generatedEmail.subject;
          bodyDraft = generatedEmail.body;
        }

        const approvalArgs = {
          actionType: step.toolArguments?.actionType || 'send_email',
          recipient,
          subject: subject || 'Anavya Report Summary',
          bodyDraft: bodyDraft || 'Your executive analysis report is ready in Anavya.',
          targetId: step.toolArguments?.targetId,
        };

        const approvalOutput = await toolRegistryService.executeTool(
          'approval_protected_action',
          approvalArgs,
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );

        toolResults.push({ toolName: 'approval_protected_action', output: approvalOutput });

        const result: AgentResult = {
          agentType: agentRole,
          status: 'waiting_for_approval',
          summary: approvalOutput.message,
          findings: { approvalOutput, bodyDraft: approvalArgs.bodyDraft },
          approvalId: approvalOutput.approvalId,
          aiMode: geminiService.isMockMode() ? 'mock' : 'gemini',
        };

        await prisma.agentExecution.update({
          where: { id: executionRecord.id },
          data: {
            output: result as any,
            status: 'waiting_for_approval',
            completedAt: new Date(),
          },
        });

        return result;
      }

      // 3. Execute AI reasoning / content generation via Gemini Service
      const aiResponse = await geminiService.executeAgentPrompt(
        agentRole,
        systemInstructions,
        enrichedContext
      );

      // 4. Execute post-generation artifact tools (Google Sheets Create, Google Docs, Google Drive, Gmail Draft, or Workspace file_writer)
      if (step.requiredTools.includes('google_sheets.create_spreadsheet')) {
        let sheetTitle = step.toolArguments?.title || '';
        let sheetValues = step.toolArguments?.values;

        if (!sheetTitle || !Array.isArray(sheetValues) || sheetValues.length === 0) {
          const generatedTable = await geminiService.generateSpreadsheetTable(
            context.objective,
            aiResponse.text
          );
          sheetTitle = sheetTitle || generatedTable.title;
          sheetValues =
            Array.isArray(sheetValues) && sheetValues.length > 0
              ? sheetValues
              : generatedTable.values;
        }

        const sheetOutput = await toolRegistryService.executeTool(
          'google_sheets.create_spreadsheet',
          {
            title: sheetTitle,
            values: sheetValues,
          },
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );

        toolResults.push({ toolName: 'google_sheets.create_spreadsheet', output: sheetOutput });
        artifacts.push({
          fileId: sheetOutput.workspaceFileId || sheetOutput.spreadsheetId,
          filename: `${sheetTitle}.xlsx`,
          fileType: 'google_sheet',
          size: JSON.stringify(sheetValues || []).length,
          downloadUrl: sheetOutput.spreadsheetUrl,
          externalUrl: sheetOutput.spreadsheetUrl,
          documentId: sheetOutput.spreadsheetId,
        });
      }

      if (step.requiredTools.includes('google_docs.create_document')) {
        const simpleDocumentContent = createSimpleNamesDocument(context.objective);
        const docTitle =
          (simpleDocumentContent ? 'Names' : step.toolArguments?.title) ||
          `Anavya Report - ${new Date().toISOString().slice(0, 10)}`;
        const docOutput = await toolRegistryService.executeTool(
          'google_docs.create_document',
          {
            title: docTitle,
            content: simpleDocumentContent || aiResponse.text,
          },
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );

        toolResults.push({ toolName: 'google_docs.create_document', output: docOutput });
        artifacts.push({
          fileId: docOutput.workspaceFileId || docOutput.documentId,
          filename: `${docTitle}.gdoc`,
          fileType: 'google_doc',
          size: (simpleDocumentContent || aiResponse.text).length,
          downloadUrl: docOutput.documentUrl,
          externalUrl: docOutput.documentUrl,
          documentId: docOutput.documentId,
        });
      }

      if (step.requiredTools.includes('gmail.create_draft')) {
        const draftOutput = await toolRegistryService.executeTool(
          'gmail.create_draft',
          {
            recipient: step.toolArguments?.recipient || 'client@example.com',
            subject: step.toolArguments?.subject || 'Anavya Executive Summary Draft',
            body: aiResponse.text,
          },
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );
        toolResults.push({ toolName: 'gmail.create_draft', output: draftOutput });
      }

      if (step.requiredTools.includes('google_drive.upload_file')) {
        const driveFilename = step.toolArguments?.filename || 'anavya_report.md';
        const driveOutput = await toolRegistryService.executeTool(
          'google_drive.upload_file',
          {
            filename: driveFilename,
            content: aiResponse.text,
            mimeType: 'text/markdown',
          },
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );
        toolResults.push({ toolName: 'google_drive.upload_file', output: driveOutput });
        artifacts.push({
          fileId: driveOutput.fileId,
          filename: driveOutput.name,
          fileType: 'google_drive',
          size: aiResponse.text.length,
          downloadUrl: driveOutput.webViewLink,
          externalUrl: driveOutput.webViewLink,
        });
      }

      if (
        step.requiredTools.includes('file_writer') &&
        !step.requiredTools.includes('google_docs.create_document')
      ) {
        const filename = step.toolArguments?.filename || 'generated_report.md';
        const fileType = step.toolArguments?.fileType || 'md';
        const writeOutput = await toolRegistryService.executeTool(
          'file_writer',
          {
            filename,
            content: aiResponse.text,
            fileType,
          },
          {
            userId: context.userId,
            taskId: context.taskId,
            conversationId: context.conversationId,
            agentType: agentRole,
          }
        );

        toolResults.push({ toolName: 'file_writer', output: writeOutput });
        artifacts.push(writeOutput);
      }

      const result: AgentResult = {
        agentType: agentRole,
        status: 'completed',
        summary: aiResponse.text,
        findings: {
          toolResults,
        },
        artifacts: artifacts.length > 0 ? artifacts : undefined,
        aiMode: aiResponse.aiMode,
      };

      await prisma.agentExecution.update({
        where: { id: executionRecord.id },
        data: {
          output: result as any,
          status: 'completed',
          completedAt: new Date(),
        },
      });

      realtimeService.emitToUser(
        context.userId,
        'agent.execution.completed',
        {
          agentExecutionId: executionRecord.id,
          agentType: agentRole,
          summary: result.summary,
          artifacts: result.artifacts,
        },
        { conversationId: context.conversationId, taskId: context.taskId }
      );

      return result;
    } catch (err: any) {
      await prisma.agentExecution.update({
        where: { id: executionRecord.id },
        data: {
          status: 'failed',
          error: err?.message || 'Agent execution failed',
          completedAt: new Date(),
        },
      });

      realtimeService.emitToUser(
        context.userId,
        'agent.execution.failed',
        {
          agentExecutionId: executionRecord.id,
          agentType: agentRole,
          error: err?.message || 'Agent execution failed',
        },
        { conversationId: context.conversationId, taskId: context.taskId }
      );

      throw err;
    }
  }
}

export const specialistAgentService = new SpecialistAgentService();
