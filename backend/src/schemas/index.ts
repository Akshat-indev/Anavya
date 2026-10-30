import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(8, 'Password must be at least 8 characters long'),
});

export const loginSchema = z.object({
  email: z.string().email('Valid email is required'),
  password: z.string().min(1, 'Password is required'),
});

export const actionPermissionsSchema = z
  .object({
    allowReadOnly: z.boolean().optional().default(true),
    allowDocCreation: z.boolean().optional().default(true),
    allowSheetModification: z.boolean().optional().default(false),
    allowEmailDrafting: z.boolean().optional().default(true),
    allowEmailSending: z.boolean().optional().default(false),
    allowTelegramMessaging: z.boolean().optional().default(false),
    requireApproval: z.boolean().optional().default(true),
  })
  .optional();

export const executionBehaviorSchema = z
  .object({
    maxSteps: z.number().int().min(1).max(8).optional().default(5),
    maxRetries: z.number().int().min(0).max(3).optional().default(1),
    timeoutSec: z.number().int().min(10).max(180).optional().default(60),
    canDelegate: z.boolean().optional().default(false),
    requireApproval: z.boolean().optional().default(true),
    canCollaborate: z.boolean().optional().default(true),
    saveToMemory: z.boolean().optional().default(true),
  })
  .optional();

export const outputPreferencesSchema = z
  .object({
    responseLength: z.enum(['concise', 'balanced', 'detailed']).optional().default('balanced'),
    outputFormat: z
      .enum(['markdown', 'bullet_points', 'executive_report', 'json', 'code_first'])
      .optional()
      .default('markdown'),
    tone: z.string().max(100).optional().default('Professional'),
    formattingPreferences: z.string().max(500).optional().default(''),
    requireSummaries: z.boolean().optional().default(true),
    requireCitations: z.boolean().optional().default(true),
  })
  .optional();

export const memorySettingsSchema = z
  .object({
    useConversationContext: z.boolean().optional().default(true),
    useUserPreferences: z.boolean().optional().default(true),
    saveTaskSummaries: z.boolean().optional().default(true),
    saveReusableKnowledge: z.boolean().optional().default(true),
    disableMemory: z.boolean().optional().default(false),
  })
  .optional();

export const createAgentSchema = z.object({
  name: z.string().min(2).max(100),
  role: z.enum(['coordinator', 'researcher', 'analyst', 'writer', 'developer']),
  description: z.string().max(1000).optional().default(''),
  category: z.string().max(80).optional().default('Custom'),
  avatar: z.string().max(60).optional().default('custom'),
  accentColor: z.string().max(25).optional().default('#F59E0B'),
  intro: z.string().max(300).optional().default(''),
  personality: z.string().max(80).optional().default('Professional'),
  systemInstructions: z.string().min(10).max(8000),
  enabledTools: z.array(z.string()).optional().default([]),
  actionPermissions: actionPermissionsSchema,
  executionBehavior: executionBehaviorSchema,
  outputPreferences: outputPreferencesSchema,
  memorySettings: memorySettingsSchema,
  isDraft: z.boolean().optional().default(false),
  isActive: z.boolean().optional().default(true),
});

export const updateAgentSchema = z.object({
  name: z.string().min(2).max(100).optional(),
  role: z.enum(['coordinator', 'researcher', 'analyst', 'writer', 'developer']).optional(),
  description: z.string().max(1000).optional(),
  category: z.string().max(80).optional(),
  avatar: z.string().max(60).optional(),
  accentColor: z.string().max(25).optional(),
  intro: z.string().max(300).optional(),
  personality: z.string().max(80).optional(),
  systemInstructions: z.string().min(10).max(8000).optional(),
  enabledTools: z.array(z.string()).optional(),
  actionPermissions: actionPermissionsSchema,
  executionBehavior: executionBehaviorSchema,
  outputPreferences: outputPreferencesSchema,
  memorySettings: memorySettingsSchema,
  isDraft: z.boolean().optional(),
  isActive: z.boolean().optional(),
});

export const testAgentSchema = z.object({
  agentId: z.string().optional(),
  name: z.string().optional(),
  role: z.enum(['coordinator', 'researcher', 'analyst', 'writer', 'developer']).optional(),
  personality: z.string().optional(),
  systemInstructions: z.string().optional(),
  enabledTools: z.array(z.string()).optional(),
  actionPermissions: z.record(z.any()).optional(),
  outputPreferences: z.record(z.any()).optional(),
  sampleInstruction: z.string().min(3, 'Sample instruction is required').max(4000),
});

export const createConversationSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  agentRole: z
    .enum(['coordinator', 'researcher', 'analyst', 'writer', 'developer'])
    .optional()
    .default('coordinator'),
});

export const updateConversationSchema = z.object({
  title: z.string().min(1).max(150).optional(),
  agentRole: z.enum(['coordinator', 'researcher', 'analyst', 'writer', 'developer']).optional(),
});

export const createChatMessageSchema = z.object({
  content: z.string().min(1, 'Message content is required').max(10000),
  attachmentId: z.string().optional(),
  spreadsheetId: z.string().optional(),
});

export const createTaskSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z
    .string()
    .min(5, 'Task objective description must be at least 5 characters')
    .max(5000),
  conversationId: z.string().optional(),
  spreadsheetId: z.string().optional(),
  fileIds: z.array(z.string()).optional(),
  executeSynchronously: z.boolean().optional().default(true),
});

export const plannedStepSchema = z.object({
  sequence: z.number().int().min(1).max(8),
  agentType: z.enum(['researcher', 'analyst', 'writer', 'developer']),
  description: z.string().min(3),
  requiredTools: z.array(z.string()).default([]),
  toolArguments: z.record(z.any()).optional(),
});

export const executionPlanSchema = z.object({
  objectiveSummary: z.string().min(3),
  workType: z.enum([
    'research',
    'data_analysis',
    'report_generation',
    'development',
    'approval_action',
    'mixed',
  ]),
  steps: z.array(plannedStepSchema).min(1).max(8),
});

export const createMemorySchema = z.object({
  category: z.enum([
    'user_preference',
    'project_context',
    'task_summary',
    'reusable_knowledge',
    'workflow_instruction',
  ]),
  content: z.string().min(3).max(5000),
  metadata: z.record(z.any()).optional(),
});

export const updateMemorySchema = z.object({
  category: z
    .enum([
      'user_preference',
      'project_context',
      'task_summary',
      'reusable_knowledge',
      'workflow_instruction',
    ])
    .optional(),
  content: z.string().min(3).max(5000).optional(),
  metadata: z.record(z.any()).optional(),
});

export const resolveApprovalSchema = z.object({
  reason: z.string().min(1).max(1000).optional().default('Resolved by user'),
  editedDraft: z
    .object({
      recipient: z.string().optional(),
      subject: z.string().optional(),
      bodyDraft: z.string().optional(),
      text: z.string().optional(),
    })
    .optional(),
});

export const createAutomationSchema = z.object({
  name: z.string().min(3).max(150),
  description: z.string().min(5).max(2000),
  workflowDefinition: z.object({
    type: z.string().default('custom_workflow'),
    objectiveTemplate: z.string().min(5),
    steps: z.array(plannedStepSchema).min(1).max(8).optional(),
  }),
});

export const runAutomationSchema = z.object({
  fileId: z.string().optional(),
  filename: z.string().optional(),
  parameters: z.record(z.any()).optional(),
});

// Google & Telegram Integration Schemas
export const googleSheetsModifySchema = z.object({
  range: z.string().min(1, 'Range is required (e.g., Sheet1!A1:B2)'),
  values: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
  requireApproval: z.boolean().optional().default(false),
});

export const googleDocsCreateSchema = z.object({
  title: z.string().min(1, 'Document title is required').max(200),
  content: z.string().min(1, 'Document content is required'),
  conversationId: z.string().optional(),
  taskId: z.string().optional(),
});

export const googleDocsUpdateSchema = z.object({
  content: z.string().min(1, 'Content to append/update is required'),
});

export const googleDriveUploadSchema = z.object({
  filename: z.string().min(1, 'Filename is required').max(200),
  content: z.string().min(1, 'File content is required'),
  mimeType: z.string().optional().default('text/markdown'),
});

export const gmailDraftSchema = z.object({
  recipient: z.string().email('Valid recipient email is required'),
  subject: z.string().min(1, 'Email subject is required').max(250),
  body: z.string().min(1, 'Email body is required').max(15000),
});

export const googleQuickConnectSchema = z.object({
  email: z.string().email('Valid Google Account email is required'),
  name: z.string().optional(),
});

export const telegramConnectSchema = z.object({
  phoneNumber: z.string().min(3, 'Valid Telegram phone number or username is required').optional(),
  botToken: z.string().min(10, 'Valid Telegram Bot token is required').optional(),
  chatId: z.string().optional(),
});

export const telegramLinkChatSchema = z.object({
  chatId: z.string().min(1, 'Telegram Chat ID is required'),
});

export const telegramSendMessageSchema = z.object({
  text: z.string().min(1, 'Message text is required').max(4096),
  chatId: z.string().optional(),
});
