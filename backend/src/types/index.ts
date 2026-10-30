import { Request } from 'express';

export interface AuthUser {
  id: string;
  email: string;
}

export interface AuthenticatedRequest extends Request {
  user?: AuthUser;
}

export type TaskStatus =
  | 'pending'
  | 'planning'
  | 'running'
  | 'waiting_for_approval'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StepStatus =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'skipped'
  | 'waiting_for_approval';

export type AgentRole = 'coordinator' | 'researcher' | 'analyst' | 'writer' | 'developer';

export type MemoryCategory =
  | 'user_preference'
  | 'project_context'
  | 'task_summary'
  | 'reusable_knowledge'
  | 'workflow_instruction';

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'failed';

export interface PlannedStep {
  sequence: number;
  agentType: Exclude<AgentRole, 'coordinator'>;
  description: string;
  requiredTools: string[];
  toolArguments?: Record<string, any>;
}

export interface ExecutionPlan {
  objectiveSummary: string;
  workType: 'research' | 'data_analysis' | 'report_generation' | 'development' | 'approval_action' | 'mixed';
  steps: PlannedStep[];
}

export interface AgentExecutionContext {
  userId: string;
  taskId: string;
  conversationId?: string;
  objective: string;
  stepDescription: string;
  previousOutputs: Array<{
    sequence: number;
    agentType: string;
    description: string;
    output: any;
  }>;
  toolResults: Array<{
    toolName: string;
    output: any;
  }>;
  memories: Array<{
    category: string;
    content: string;
  }>;
  workspaceFiles: Array<{
    id: string;
    filename: string;
    mimeType: string;
  }>;
}

export interface AgentResult {
  agentType: AgentRole;
  status: 'completed' | 'waiting_for_approval' | 'failed';
  summary: string;
  findings?: any;
  artifacts?: Array<{
    fileId: string;
    filename: string;
    fileType: string;
    size: number;
    downloadUrl: string;
    externalUrl?: string;
    documentId?: string;
  }>;
  approvalId?: string;
  aiMode: 'gemini' | 'mock';
}

