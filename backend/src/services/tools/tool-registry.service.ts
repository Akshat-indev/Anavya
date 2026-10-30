import { parse } from 'csv-parse/sync';
import { z, ZodSchema } from 'zod';
import { prisma } from '../../config/db';
import { AppError } from '../../utils/errors';
import { workspaceService } from '../workspace/workspace.service';
import { googleIntegrationService } from '../integrations/google.service';
import { telegramIntegrationService } from '../integrations/telegram.service';
import { realtimeService } from '../realtime/realtime.service';
import { AgentRole } from '../../types';

export interface ToolExecutionContext {
  userId: string;
  taskId: string;
  conversationId?: string;
  agentType: AgentRole;
}

export interface ToolDefinition<TInput = any, TOutput = any> {
  name: string;
  description: string;
  inputSchema: ZodSchema<TInput>;
  outputSchema: ZodSchema<TOutput>;
  requiredPermissions: AgentRole[];
  requiresApproval: boolean;
  timeoutMs: number;
  execute: (input: TInput, context: ToolExecutionContext) => Promise<TOutput>;
}

const webResearchInputSchema = z.object({
  query: z.string().min(2),
});
const webResearchOutputSchema = z.object({
  available: z.boolean(),
  statusMessage: z.string(),
  results: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      snippet: z.string(),
    })
  ),
});

const fileReaderInputSchema = z.object({
  filename: z.string().min(1),
});
const fileReaderOutputSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  mimeType: z.string(),
  size: z.number(),
  content: z.string(),
});

const fileWriterInputSchema = z.object({
  filename: z.string().min(1),
  content: z.string().min(1),
  fileType: z.enum(['md', 'txt', 'json', 'csv']).optional().default('md'),
});
const fileWriterOutputSchema = z.object({
  fileId: z.string(),
  filename: z.string(),
  fileType: z.string(),
  size: z.number(),
  downloadUrl: z.string(),
});

const csvAnalyzerInputSchema = z.object({
  filename: z.string().optional().default('sales.csv'),
  csvContent: z.string().optional(),
  topN: z.number().int().min(1).max(20).optional().default(5),
});
const csvAnalyzerOutputSchema = z.object({
  filename: z.string(),
  rowCount: z.number(),
  columnCount: z.number(),
  columns: z.array(z.string()),
  columnTypes: z.record(z.enum(['numeric', 'string', 'empty'])),
  missingValuesCount: z.number(),
  missingByColumn: z.record(z.number()),
  unusualValuesCount: z.number().optional(),
  numericSummaries: z.record(
    z.object({
      sum: z.number(),
      average: z.number(),
      min: z.number(),
      max: z.number(),
      count: z.number(),
    })
  ),
  GrandTotalRevenue: z.number().optional(),
  topProductsByRevenue: z
    .array(
      z.object({
        product: z.string(),
        category: z.string().optional(),
        totalQuantity: z.number(),
        totalRevenue: z.number(),
        revenueSharePercent: z.number(),
      })
    )
    .optional(),
  categoryBreakdown: z.record(z.number()).optional(),
});

const approvalActionInputSchema = z.object({
  actionType: z
    .enum([
      'send_email',
      'publish_content',
      'delete_file',
      'external_update',
      'telegram.send_message',
      'google_sheets.append_rows',
      'google_sheets.update_range',
    ])
    .default('send_email'),
  recipient: z.string().optional().default('client@example.com'),
  subject: z.string().optional().default('Summary Report'),
  bodyDraft: z.string().min(1),
  targetId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
});
const approvalActionOutputSchema = z.object({
  approvalRequired: z.boolean(),
  approvalId: z.string(),
  status: z.string(),
  message: z.string(),
});

export class ToolRegistryService {
  private tools: Map<string, ToolDefinition> = new Map();

  constructor() {
    this.registerDefaultTools();
  }

  private async createToolApproval(
    context: ToolExecutionContext,
    actionName: string,
    actionArguments: Record<string, any>,
    message: string
  ) {
    const approval = await prisma.approval.create({
      data: {
        userId: context.userId,
        taskId: context.taskId,
        conversationId: context.conversationId || null,
        actionName,
        actionArguments,
        status: 'pending',
      },
    });

    realtimeService.emitToUser(
      context.userId,
      'approval.required',
      {
        approvalId: approval.id,
        actionName,
        actionArguments,
        message,
      },
      { conversationId: context.conversationId, taskId: context.taskId }
    );

    return {
      approvalRequired: true,
      approvalId: approval.id,
      status: 'pending',
      message,
    };
  }

  private registerDefaultTools(): void {
    // 1. Web Research
    this.registerTool({
      name: 'web_research',
      description:
        'Search for information on the internet. Reports clearly when external search provider is disabled on free tier without fabricating results.',
      inputSchema: webResearchInputSchema,
      outputSchema: webResearchOutputSchema,
      requiredPermissions: ['coordinator', 'researcher'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async () => ({
        available: false,
        statusMessage:
          'External live web search is not enabled on the free-tier configuration. No search results were fabricated.',
        results: [],
      }),
    });

    // 2. File Reader
    this.registerTool({
      name: 'file_reader',
      description: 'Read TXT, Markdown, CSV, or JSON files safely from the authenticated user workspace.',
      inputSchema: fileReaderInputSchema,
      outputSchema: fileReaderOutputSchema,
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 5000,
      execute: async (input, context) => {
        const { file, content } = await workspaceService.readFileContentByName(
          context.userId,
          input.filename
        );
        return {
          fileId: file.id,
          filename: file.filename,
          mimeType: file.mimeType,
          size: file.size,
          content,
        };
      },
    });

    // 3. File Writer
    this.registerTool({
      name: 'file_writer',
      description: 'Generate Markdown, TXT, JSON, or CSV documents and save them in the user workspace.',
      inputSchema: fileWriterInputSchema,
      outputSchema: fileWriterOutputSchema,
      requiredPermissions: ['coordinator', 'writer', 'developer', 'analyst'],
      requiresApproval: false,
      timeoutMs: 5000,
      execute: async (input, context) => {
        let filename = input.filename;
        if (!filename.includes('.')) {
          filename = `${filename}.${input.fileType || 'md'}`;
        }
        const saved = await workspaceService.writeGeneratedFile(
          context.userId,
          filename,
          input.content
        );
        if (context.conversationId || context.taskId) {
          await prisma.workspaceFile.update({
            where: { id: saved.id },
            data: {
              conversationId: context.conversationId || null,
              taskId: context.taskId || null,
            },
          });
        }
        const ext = filename.split('.').pop() || 'md';
        return {
          fileId: saved.id,
          filename: saved.filename,
          fileType: ext,
          size: saved.size,
          downloadUrl: `/api/v1/workspace/files/${saved.id}/download`,
        };
      },
    });

    // 4. Deterministic CSV Analyzer
    this.registerTool({
      name: 'csv_analyzer',
      description:
        'Perform deterministic CSV/spreadsheet data analysis: row/column counts, column type detection, sum/avg/min/max, top-N product rankings, category grouped totals, unusual/outlier values, and missing value detection.',
      inputSchema: csvAnalyzerInputSchema,
      outputSchema: csvAnalyzerOutputSchema,
      requiredPermissions: ['coordinator', 'analyst'],
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (input, context) => {
        if (input.csvContent && input.csvContent.trim() !== '') {
          return this.analyzeCsvContent(input.filename || 'spreadsheet.csv', input.csvContent, input.topN || 5);
        }
        const { file, content } = await workspaceService.readFileContentByName(
          context.userId,
          String(input.filename || 'sales.csv')
        );
        return this.analyzeCsvContent(file.filename, content, input.topN || 5);
      },
    });

    // 5. Generic Approval-Protected Action
    this.registerTool({
      name: 'approval_protected_action',
      description:
        'Submit a protected action (such as sending an email draft, publishing content, or deleting a file) for mandatory human approval.',
      inputSchema: approvalActionInputSchema,
      outputSchema: approvalActionOutputSchema,
      requiredPermissions: ['coordinator', 'writer', 'developer', 'analyst'],
      requiresApproval: true,
      timeoutMs: 5000,
      execute: async (input, context) => {
        const actionType = String(input.actionType || 'send_email');
        return this.createToolApproval(
          context,
          actionType,
          {
            recipient: input.recipient,
            subject: input.subject,
            bodyDraft: input.bodyDraft,
            targetId: input.targetId,
            ...(input.metadata || {}),
          },
          `Action '${actionType}' paused waiting for human approval.`
        );
      },
    });

    // ==========================================
    // 6. GOOGLE SHEETS TOOLS
    // ==========================================
    this.registerTool({
      name: 'google_sheets.create_spreadsheet',
      description:
        'Create a new Google Spreadsheet (Excel sheet) in the user Google Workspace account and populate it with header and data rows.',
      inputSchema: z.object({
        title: z.string().min(1),
        values: z.array(z.array(z.union([z.string(), z.number()]))).optional(),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        spreadsheetId: z.string(),
        title: z.string(),
        spreadsheetUrl: z.string(),
        updatedRows: z.number().optional(),
        workspaceFileId: z.string().optional(),
      }),
      requiredPermissions: ['coordinator', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 20000,
      execute: async (input, context) => {
        return googleIntegrationService.createSpreadsheet(
          context.userId,
          input.title,
          input.values,
          { conversationId: context.conversationId, taskId: context.taskId }
        );
      },
    });

    this.registerTool({
      name: 'google_sheets.list_spreadsheets',
      description: 'List accessible Google Spreadsheets in the authenticated user Google Workspace account.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        spreadsheets: z.array(
          z.object({
            spreadsheetId: z.string(),
            title: z.string(),
            modifiedTime: z.string().optional(),
            url: z.string(),
          })
        ),
      }),
      requiredPermissions: ['coordinator', 'analyst', 'researcher'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (_input, context) => {
        return googleIntegrationService.listSpreadsheets(context.userId);
      },
    });

    this.registerTool({
      name: 'google_sheets.read',
      description:
        'Read spreadsheet metadata, sheet names, and cell values from a specified range, plus run deterministic numerical analysis on the rows.',
      inputSchema: z.object({
        spreadsheetId: z.string().min(1, 'spreadsheetId is required'),
        range: z.string().optional().default('Sheet1!A1:Z500'),
      }),
      outputSchema: z.object({
        spreadsheetId: z.string(),
        title: z.string(),
        sheetNames: z.array(z.string()),
        range: z.string(),
        rowCount: z.number(),
        headers: z.array(z.string()),
        analysis: z.any().optional(),
      }),
      requiredPermissions: ['coordinator', 'analyst', 'researcher'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        const sheetData = await googleIntegrationService.readSpreadsheet(
          context.userId,
          input.spreadsheetId,
          input.range || 'Sheet1!A1:Z500'
        );
        let analysis = undefined;
        if (sheetData.csvContent && sheetData.rowCount > 0) {
          try {
            analysis = this.analyzeCsvContent(sheetData.title || 'GoogleSheet.csv', sheetData.csvContent, 5);
          } catch (_e) {
            // Keep raw rows if non-tabular
          }
        }
        return {
          spreadsheetId: sheetData.spreadsheetId,
          title: sheetData.title,
          sheetNames: sheetData.sheetNames,
          range: sheetData.range,
          rowCount: sheetData.rowCount,
          headers: sheetData.headers,
          analysis,
        };
      },
    });

    this.registerTool({
      name: 'google_sheets.append_rows',
      description:
        'Append rows to an existing Google Spreadsheet. Requires human approval before modifying user spreadsheets.',
      inputSchema: z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().optional().default('Sheet1!A1'),
        values: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
      }),
      outputSchema: approvalActionOutputSchema,
      requiredPermissions: ['coordinator', 'analyst', 'writer'],
      requiresApproval: true,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return this.createToolApproval(
          context,
          'google_sheets.append_rows',
          {
            spreadsheetId: input.spreadsheetId,
            range: input.range || 'Sheet1!A1',
            values: input.values,
            bodyDraft: `Append ${input.values.length} row(s) to Google Sheet '${input.spreadsheetId}' (${input.range || 'Sheet1!A1'}).`,
          },
          `Approval required to append ${input.values.length} row(s) to Google Sheet.`
        );
      },
    });

    this.registerTool({
      name: 'google_sheets.update_range',
      description:
        'Update cells in a specific range of an existing Google Spreadsheet. Requires human approval before modifying user spreadsheets.',
      inputSchema: z.object({
        spreadsheetId: z.string().min(1),
        range: z.string().min(1),
        values: z.array(z.array(z.union([z.string(), z.number()]))).min(1),
      }),
      outputSchema: approvalActionOutputSchema,
      requiredPermissions: ['coordinator', 'analyst', 'writer'],
      requiresApproval: true,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return this.createToolApproval(
          context,
          'google_sheets.update_range',
          {
            spreadsheetId: input.spreadsheetId,
            range: input.range,
            values: input.values,
            bodyDraft: `Update range ${input.range} in Google Sheet '${input.spreadsheetId}'.`,
          },
          `Approval required to update range ${input.range} in Google Sheet.`
        );
      },
    });

    // ==========================================
    // 7. GOOGLE DOCS TOOLS
    // ==========================================
    this.registerTool({
      name: 'google_docs.create_document',
      description:
        'Create a new Google Doc in the authenticated user Google Workspace account with formatted report content and return the real documentId and documentUrl.',
      inputSchema: z.object({
        title: z.string().min(1),
        content: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        documentId: z.string(),
        title: z.string(),
        documentUrl: z.string(),
        workspaceFileId: z.string().optional(),
      }),
      requiredPermissions: ['coordinator', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 20000,
      execute: async (input, context) => {
        return googleIntegrationService.createDocument(
          context.userId,
          input.title,
          input.content,
          { conversationId: context.conversationId, taskId: context.taskId }
        );
      },
    });

    this.registerTool({
      name: 'google_docs.read_document',
      description: 'Read text content from an existing Google Doc in the user Google Workspace account.',
      inputSchema: z.object({
        documentId: z.string().min(1),
      }),
      outputSchema: z.object({
        documentId: z.string(),
        title: z.string(),
        content: z.string(),
        documentUrl: z.string(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.readDocument(context.userId, input.documentId);
      },
    });

    this.registerTool({
      name: 'google_docs.append_content',
      description: 'Append text content to an existing Google Doc.',
      inputSchema: z.object({
        documentId: z.string().min(1),
        content: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        documentId: z.string(),
        documentUrl: z.string(),
      }),
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.appendDocumentContent(
          context.userId,
          input.documentId,
          input.content
        );
      },
    });

    this.registerTool({
      name: 'google_docs.update_content',
      description: 'Update content in an existing Google Doc.',
      inputSchema: z.object({
        documentId: z.string().min(1),
        content: z.string().min(1),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        documentId: z.string(),
        documentUrl: z.string(),
      }),
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.appendDocumentContent(
          context.userId,
          input.documentId,
          input.content
        );
      },
    });

    // ==========================================
    // 8. TELEGRAM TOOLS
    // ==========================================
    this.registerTool({
      name: 'telegram.get_bot_info',
      description: 'Validate and retrieve connected Telegram Bot info via getMe.',
      inputSchema: z.object({}),
      outputSchema: z.object({
        id: z.string(),
        username: z.string(),
        firstName: z.string().optional(),
        canJoinGroups: z.boolean().optional(),
      }),
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (_input, context) => {
        return telegramIntegrationService.getBotInfo(context.userId);
      },
    });

    this.registerTool({
      name: 'telegram.get_chat_info',
      description: 'Retrieve metadata for the user linked Telegram chat.',
      inputSchema: z.object({
        chatId: z.string().optional(),
      }),
      outputSchema: z.object({
        chatId: z.string(),
        title: z.string(),
        type: z.string().optional(),
      }),
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return telegramIntegrationService.getChatInfo(context.userId, input.chatId);
      },
    });

    this.registerTool({
      name: 'telegram.send_message',
      description:
        'Prepare a Telegram notification message to the user linked Telegram chat. Always requires human approval before sending.',
      inputSchema: z.object({
        text: z.string().min(1),
        chatId: z.string().optional(),
      }),
      outputSchema: approvalActionOutputSchema,
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: true,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return this.createToolApproval(
          context,
          'telegram.send_message',
          {
            text: input.text,
            chatId: input.chatId,
            bodyDraft: input.text,
            subject: 'Telegram Notification',
          },
          `Your notification is ready. Would you like me to send this message to your connected Telegram chat?`
        );
      },
    });

    // ==========================================
    // 9. GOOGLE DRIVE TOOLS
    // ==========================================
    this.registerTool({
      name: 'google_drive.list_files',
      description: 'List accessible files in the authenticated user Google Drive account.',
      inputSchema: z.object({
        pageSize: z.number().int().min(1).max(50).optional().default(20),
      }),
      outputSchema: z.object({
        files: z.array(
          z.object({
            fileId: z.string(),
            name: z.string(),
            mimeType: z.string(),
            size: z.number(),
            modifiedTime: z.string().optional(),
            webViewLink: z.string(),
          })
        ),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.listDriveFiles(context.userId, input.pageSize || 20);
      },
    });

    this.registerTool({
      name: 'google_drive.search_files',
      description: 'Search permitted Google Drive files by filename or keyword.',
      inputSchema: z.object({
        query: z.string().min(1),
      }),
      outputSchema: z.object({
        query: z.string(),
        files: z.array(
          z.object({
            fileId: z.string(),
            name: z.string(),
            mimeType: z.string(),
            size: z.number(),
            modifiedTime: z.string().optional(),
            webViewLink: z.string(),
          })
        ),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.searchDriveFiles(context.userId, input.query);
      },
    });

    this.registerTool({
      name: 'google_drive.get_file_metadata',
      description: 'Retrieve metadata for a specific Google Drive file.',
      inputSchema: z.object({
        fileId: z.string().min(1),
      }),
      outputSchema: z.object({
        fileId: z.string(),
        name: z.string(),
        mimeType: z.string(),
        size: z.number(),
        modifiedTime: z.string().optional(),
        webViewLink: z.string(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return googleIntegrationService.getDriveFileMetadata(context.userId, input.fileId);
      },
    });

    this.registerTool({
      name: 'google_drive.download_file',
      description: 'Download or export text/CSV content from a permitted Google Drive file.',
      inputSchema: z.object({
        fileId: z.string().min(1),
      }),
      outputSchema: z.object({
        fileId: z.string(),
        name: z.string(),
        mimeType: z.string(),
        content: z.string(),
        webViewLink: z.string(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.downloadDriveFile(context.userId, input.fileId);
      },
    });

    this.registerTool({
      name: 'google_drive.upload_file',
      description: 'Upload a generated document or file to the authenticated user Google Drive.',
      inputSchema: z.object({
        name: z.string().min(1),
        content: z.string().min(1),
        mimeType: z.string().optional().default('text/markdown'),
      }),
      outputSchema: z.object({
        fileId: z.string(),
        name: z.string(),
        mimeType: z.string(),
        webViewLink: z.string(),
      }),
      requiredPermissions: ['coordinator', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 20000,
      execute: async (input, context) => {
        return googleIntegrationService.uploadDriveFile(
          context.userId,
          input.name,
          input.content,
          input.mimeType || 'text/markdown'
        );
      },
    });

    this.registerTool({
      name: 'google_drive.get_file_link',
      description: 'Retrieve the shareable web view link for a Google Drive file.',
      inputSchema: z.object({
        fileId: z.string().min(1),
      }),
      outputSchema: z.object({
        fileId: z.string(),
        name: z.string(),
        webViewLink: z.string(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer', 'developer'],
      requiresApproval: false,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return googleIntegrationService.getDriveFileLink(context.userId, input.fileId);
      },
    });

    // ==========================================
    // 10. GMAIL TOOLS
    // ==========================================
    this.registerTool({
      name: 'gmail.list_messages',
      description: 'List recent emails from the authenticated user Gmail inbox.',
      inputSchema: z.object({
        maxResults: z.number().int().min(1).max(25).optional().default(10),
      }),
      outputSchema: z.object({
        messages: z.array(
          z.object({
            messageId: z.string(),
            threadId: z.string().optional(),
            subject: z.string(),
            from: z.string(),
            to: z.string(),
            date: z.string(),
            snippet: z.string(),
            body: z.string(),
          })
        ),
        totalCount: z.number(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.listGmailMessages(context.userId, input.maxResults || 10);
      },
    });

    this.registerTool({
      name: 'gmail.search_messages',
      description: 'Search emails in Gmail by sender, subject, or keywords.',
      inputSchema: z.object({
        query: z.string().min(1),
        maxResults: z.number().int().min(1).max(25).optional().default(10),
      }),
      outputSchema: z.object({
        messages: z.array(
          z.object({
            messageId: z.string(),
            threadId: z.string().optional(),
            subject: z.string(),
            from: z.string(),
            to: z.string(),
            date: z.string(),
            snippet: z.string(),
            body: z.string(),
          })
        ),
        totalCount: z.number(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.searchGmailMessages(
          context.userId,
          input.query,
          input.maxResults || 10
        );
      },
    });

    this.registerTool({
      name: 'gmail.get_message',
      description: 'Read a specific email message by ID from the user Gmail account.',
      inputSchema: z.object({
        messageId: z.string().min(1),
      }),
      outputSchema: z.object({
        messageId: z.string(),
        threadId: z.string().optional(),
        subject: z.string(),
        from: z.string(),
        to: z.string(),
        date: z.string(),
        snippet: z.string(),
        body: z.string(),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.getGmailMessage(context.userId, input.messageId);
      },
    });

    this.registerTool({
      name: 'gmail.get_thread',
      description: 'Read an entire email conversation thread from Gmail.',
      inputSchema: z.object({
        threadId: z.string().min(1),
      }),
      outputSchema: z.object({
        threadId: z.string(),
        messages: z.array(z.any()),
      }),
      requiredPermissions: ['coordinator', 'researcher', 'analyst', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.getGmailThread(context.userId, input.threadId);
      },
    });

    this.registerTool({
      name: 'gmail.create_draft',
      description:
        'Create an email draft in the user Gmail account without sending it immediately.',
      inputSchema: z.object({
        recipient: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }),
      outputSchema: z.object({
        draftCreated: z.boolean(),
        emailSent: z.boolean(),
        draftId: z.string(),
        messageId: z.string().optional(),
        recipient: z.string(),
        subject: z.string(),
      }),
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: false,
      timeoutMs: 15000,
      execute: async (input, context) => {
        return googleIntegrationService.createGmailDraft(
          context.userId,
          input.recipient,
          input.subject,
          input.body
        );
      },
    });

    this.registerTool({
      name: 'gmail.send_message',
      description:
        'Prepare an email to be sent via Gmail. Always pauses and requires explicit human approval before sending.',
      inputSchema: z.object({
        recipient: z.string().email(),
        subject: z.string().min(1),
        body: z.string().min(1),
      }),
      outputSchema: approvalActionOutputSchema,
      requiredPermissions: ['coordinator', 'writer'],
      requiresApproval: true,
      timeoutMs: 10000,
      execute: async (input, context) => {
        return this.createToolApproval(
          context,
          'gmail.send_message',
          {
            recipient: input.recipient,
            subject: input.subject,
            bodyDraft: input.body,
          },
          `An email draft has been prepared for ${input.recipient}. Review it before sending.`
        );
      },
    });
  }

  public analyzeCsvContent(filename: string, csvText: string, topN = 5) {
    let records: Record<string, string>[];
    try {
      records = parse(csvText, {
        columns: true,
        skip_empty_lines: true,
        trim: true,
      });
    } catch (err: any) {
      throw new AppError(`Failed to parse CSV file '${filename}': ${err.message}`, 400, 'INVALID_CSV');
    }

    const rowCount = records.length;
    const columns = rowCount > 0 ? Object.keys(records[0]) : [];
    const columnCount = columns.length;

    const columnTypes: Record<string, 'numeric' | 'string' | 'empty'> = {};
    const missingByColumn: Record<string, number> = {};
    let missingValuesCount = 0;

    const numericValues: Record<string, number[]> = {};

    for (const col of columns) {
      missingByColumn[col] = 0;
      numericValues[col] = [];
    }

    for (const row of records) {
      for (const col of columns) {
        const rawVal = row[col];
        if (rawVal === undefined || rawVal === null || String(rawVal).trim() === '') {
          missingByColumn[col] += 1;
          missingValuesCount += 1;
          continue;
        }
        const cleanedNum = Number(String(rawVal).replace(/[$,]/g, ''));
        if (!Number.isNaN(cleanedNum) && String(rawVal).trim() !== '') {
          numericValues[col].push(cleanedNum);
        }
      }
    }

    const numericSummaries: Record<
      string,
      { sum: number; average: number; min: number; max: number; count: number }
    > = {};
    let unusualValuesCount = 0;

    for (const col of columns) {
      const nonMissingCount = rowCount - missingByColumn[col];
      if (nonMissingCount === 0) {
        columnTypes[col] = 'empty';
      } else if (numericValues[col].length === nonMissingCount) {
        columnTypes[col] = 'numeric';
        const vals = numericValues[col];
        const sum = Number(vals.reduce((acc, v) => acc + v, 0).toFixed(4));
        const avg = Number((sum / vals.length).toFixed(4));
        const min = Math.min(...vals);
        const max = Math.max(...vals);
        numericSummaries[col] = {
          sum,
          average: avg,
          min,
          max,
          count: vals.length,
        };
        // Detect unusual values (> 2.5x average or negative)
        for (const v of vals) {
          if (v < 0 || (avg > 0 && v > avg * 2.5)) {
            unusualValuesCount += 1;
          }
        }
      } else {
        columnTypes[col] = 'string';
      }
    }

    const productCol = columns.find((c) =>
      ['product', 'item', 'name', 'product_name'].includes(c.toLowerCase())
    );
    const categoryCol = columns.find((c) =>
      ['category', 'type', 'department', 'group'].includes(c.toLowerCase())
    );
    const revenueCol = columns.find((c) =>
      ['revenue', 'total', 'sales', 'amount', 'total_revenue'].includes(c.toLowerCase())
    );
    const quantityCol = columns.find((c) =>
      ['quantity', 'qty', 'units', 'count'].includes(c.toLowerCase())
    );
    const unitPriceCol = columns.find((c) =>
      ['unit_price', 'price', 'rate'].includes(c.toLowerCase())
    );

    let grandTotalRevenue = 0;
    const productMap: Map<
      string,
      { product: string; category?: string; totalQuantity: number; totalRevenue: number }
    > = new Map();
    const categoryBreakdown: Record<string, number> = {};

    for (const row of records) {
      const qty = quantityCol
        ? Number(String(row[quantityCol] || '0').replace(/[$,]/g, '')) || 0
        : 1;
      const unitPrice = unitPriceCol
        ? Number(String(row[unitPriceCol] || '0').replace(/[$,]/g, '')) || 0
        : 0;
      let rev = 0;
      if (revenueCol && row[revenueCol] !== undefined && String(row[revenueCol]).trim() !== '') {
        rev = Number(String(row[revenueCol]).replace(/[$,]/g, '')) || 0;
      } else if (unitPriceCol && quantityCol) {
        rev = qty * unitPrice;
      }

      grandTotalRevenue += rev;

      if (categoryCol) {
        const cat = String(row[categoryCol] || 'Uncategorized').trim() || 'Uncategorized';
        categoryBreakdown[cat] = Number(((categoryBreakdown[cat] || 0) + rev).toFixed(2));
      }

      if (productCol) {
        const prod = String(row[productCol] || 'Unknown').trim() || 'Unknown';
        const cat = categoryCol ? String(row[categoryCol] || '').trim() : undefined;
        const existing = productMap.get(prod) || {
          product: prod,
          category: cat,
          totalQuantity: 0,
          totalRevenue: 0,
        };
        existing.totalQuantity += qty;
        existing.totalRevenue = Number((existing.totalRevenue + rev).toFixed(2));
        productMap.set(prod, existing);
      }
    }

    grandTotalRevenue = Number(grandTotalRevenue.toFixed(2));

    const topProductsByRevenue = Array.from(productMap.values())
      .sort((a, b) => b.totalRevenue - a.totalRevenue)
      .slice(0, topN)
      .map((item) => ({
        ...item,
        revenueSharePercent:
          grandTotalRevenue > 0
            ? Number(((item.totalRevenue / grandTotalRevenue) * 100).toFixed(2))
            : 0,
      }));

    return {
      filename,
      rowCount,
      columnCount,
      columns,
      columnTypes,
      missingValuesCount,
      missingByColumn,
      unusualValuesCount,
      numericSummaries,
      GrandTotalRevenue: grandTotalRevenue,
      topProductsByRevenue,
      categoryBreakdown,
    };
  }

  public registerTool<TInput, TOutput>(tool: ToolDefinition<TInput, TOutput>): void {
    this.tools.set(tool.name, tool);
  }

  public listTools() {
    return Array.from(this.tools.values()).map((t) => ({
      name: t.name,
      description: t.description,
      requiredPermissions: t.requiredPermissions,
      requiresApproval: t.requiresApproval,
      timeoutMs: t.timeoutMs,
    }));
  }

  public getTool(name: string): ToolDefinition {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new AppError(
        `Tool '${name}' is not in the registered tool allowlist. Rejected.`,
        400,
        'UNKNOWN_TOOL_REJECTED'
      );
    }
    return tool;
  }

  public async executeTool(
    toolName: string,
    rawInput: unknown,
    context: ToolExecutionContext
  ): Promise<any> {
    const tool = this.getTool(toolName);

    if (!tool.requiredPermissions.includes(context.agentType)) {
      throw new AppError(
        `Agent '${context.agentType}' does not have permission to execute tool '${toolName}'.`,
        403,
        'TOOL_PERMISSION_DENIED'
      );
    }

    const parsedInput = tool.inputSchema.safeParse(rawInput);
    if (!parsedInput.success) {
      throw new AppError(
        `Invalid input for tool '${toolName}': ${parsedInput.error.message}`,
        400,
        'TOOL_INPUT_VALIDATION_ERROR'
      );
    }

    realtimeService.emitToUser(
      context.userId,
      'tool.execution.started',
      {
        toolName,
        agentType: context.agentType,
      },
      { conversationId: context.conversationId, taskId: context.taskId }
    );

    let timeoutHandle: NodeJS.Timeout | undefined;
    try {
      const output = await Promise.race([
        tool.execute(parsedInput.data, context),
        new Promise<never>((_, reject) => {
          timeoutHandle = setTimeout(
            () => reject(new AppError(`Tool '${toolName}' timed out`, 504, 'TOOL_TIMEOUT')),
            tool.timeoutMs
          );
        }),
      ]);

      const validatedOutput = tool.outputSchema.parse(output);

      const toolExec = await prisma.toolExecution.create({
        data: {
          taskId: context.taskId,
          toolName,
          input: parsedInput.data as any,
          output: validatedOutput as any,
          status: 'completed',
        },
      });

      realtimeService.emitToUser(
        context.userId,
        'tool.execution.completed',
        {
          toolExecutionId: toolExec.id,
          toolName,
          agentType: context.agentType,
          output: validatedOutput,
        },
        { conversationId: context.conversationId, taskId: context.taskId }
      );

      return validatedOutput;
    } catch (err: any) {
      await prisma.toolExecution.create({
        data: {
          taskId: context.taskId,
          toolName,
          input: (rawInput ?? {}) as any,
          output: { error: err?.message || 'Tool execution failed' } as any,
          status: 'failed',
        },
      });

      realtimeService.emitToUser(
        context.userId,
        'tool.execution.failed',
        {
          toolName,
          agentType: context.agentType,
          error: err?.message || 'Tool execution failed',
        },
        { conversationId: context.conversationId, taskId: context.taskId }
      );

      throw err;
    } finally {
      if (timeoutHandle) {
        clearTimeout(timeoutHandle);
      }
    }
  }
}

export const toolRegistryService = new ToolRegistryService();
