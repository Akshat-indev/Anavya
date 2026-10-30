export const swaggerSpec = {
  openapi: '3.0.3',
  info: {
    title: 'TaskForce AI - Chat-First Autonomous AI Teammate Workspace API',
    version: '2.0.0',
    description:
      'Full-stack Chat-First Autonomous AI Teammate Workspace powered by Google Gemini API (@google/genai), Coordinator orchestration, 5 Specialist Agents, Google Sheets & Google Docs OAuth 2.0 integrations, Telegram Bot notifications, Human-in-the-Loop Approvals, persistent Conversations, and Server-Sent Events (SSE) live execution updates.',
  },
  servers: [
    {
      url: '/api/v1',
      description: 'API v1 Base Path',
    },
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
    },
  },
  security: [{ bearerAuth: [] }],
  paths: {
    '/health': {
      get: {
        tags: ['System'],
        summary: 'System health and Gemini configuration status',
        security: [],
        responses: { 200: { description: 'Healthy status' } },
      },
    },
    '/events': {
      get: {
        tags: ['Realtime'],
        summary: 'Server-Sent Events (SSE) stream for live execution updates',
        parameters: [{ name: 'token', in: 'query', required: false, schema: { type: 'string' } }],
        responses: { 200: { description: 'SSE event stream' } },
      },
    },
    '/tools': {
      get: {
        tags: ['Tools'],
        summary: 'List all registered allowlisted backend tools',
        responses: { 200: { description: 'List of tools' } },
      },
    },
    '/auth/register': {
      post: {
        tags: ['Authentication'],
        summary: 'Register a new user and provision default specialist agents & automations',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'founder@taskforce.ai' },
                  password: { type: 'string', example: 'SecurePass123!' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'User registered' } },
      },
    },
    '/auth/login': {
      post: {
        tags: ['Authentication'],
        summary: 'Authenticate user and return JWT',
        security: [],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['email', 'password'],
                properties: {
                  email: { type: 'string', example: 'founder@taskforce.ai' },
                  password: { type: 'string', example: 'SecurePass123!' },
                },
              },
            },
          },
        },
        responses: { 200: { description: 'Authenticated' } },
      },
    },
    '/auth/me': {
      get: {
        tags: ['Authentication'],
        summary: 'Get current authenticated user profile',
        responses: { 200: { description: 'User profile' } },
      },
    },
    '/chat/conversations': {
      post: {
        tags: ['Chat'],
        summary: 'Create a new persistent chat conversation',
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                properties: {
                  title: { type: 'string', example: 'Sales Outbound' },
                  agentRole: { type: 'string', example: 'coordinator' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Conversation created' } },
      },
      get: {
        tags: ['Chat'],
        summary: 'List user chat conversations with search and latest message preview',
        parameters: [{ name: 'search', in: 'query', required: false, schema: { type: 'string' } }],
        responses: { 200: { description: 'Conversations list' } },
      },
    },
    '/chat/conversations/{id}': {
      get: {
        tags: ['Chat'],
        summary: 'Get conversation messages and associated tasks',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Conversation details' } },
      },
      patch: {
        tags: ['Chat'],
        summary: 'Rename conversation or update assigned agent role',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Conversation updated' } },
      },
      delete: {
        tags: ['Chat'],
        summary: 'Delete conversation and its messages',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Conversation deleted' } },
      },
    },
    '/chat/conversations/{id}/messages': {
      post: {
        tags: ['Chat'],
        summary: 'Send a natural-language objective in a conversation and execute autonomous workflow',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        requestBody: {
          required: true,
          content: {
            'application/json': {
              schema: {
                type: 'object',
                required: ['content'],
                properties: {
                  content: {
                    type: 'string',
                    example:
                      'Analyze my sales spreadsheet, identify the top five products, create a professional sales performance report in Google Docs, and notify me on Telegram.',
                  },
                  spreadsheetId: { type: 'string' },
                  attachmentId: { type: 'string' },
                },
              },
            },
          },
        },
        responses: { 201: { description: 'Message processed and task executed' } },
      },
    },
    '/integrations/google/connect': {
      get: {
        tags: ['Google Integration'],
        summary: 'Generate Google OAuth 2.0 authorization URL with state validation',
        responses: { 200: { description: 'OAuth URL and state' } },
      },
    },
    '/integrations/google/callback': {
      get: {
        tags: ['Google Integration'],
        summary: 'OAuth 2.0 callback to exchange code and store encrypted tokens',
        security: [],
        parameters: [
          { name: 'code', in: 'query', required: true, schema: { type: 'string' } },
          { name: 'state', in: 'query', required: true, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Google Workspace connected' } },
      },
    },
    '/integrations/google/status': {
      get: {
        tags: ['Google Integration'],
        summary: 'Get Google Workspace (Sheets & Docs) connection status',
        responses: { 200: { description: 'Connection status' } },
      },
    },
    '/integrations/google/disconnect': {
      delete: {
        tags: ['Google Integration'],
        summary: 'Disconnect Google Workspace and revoke tokens',
        responses: { 200: { description: 'Disconnected' } },
      },
    },
    '/integrations/google/spreadsheets': {
      get: {
        tags: ['Google Sheets'],
        summary: 'List accessible Google Spreadsheets for the authenticated user',
        responses: { 200: { description: 'List of spreadsheets' } },
      },
    },
    '/tools/google-sheets/{id}/read': {
      get: {
        tags: ['Google Sheets'],
        summary: 'Read range and run deterministic analysis on a Google Spreadsheet',
        parameters: [
          { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          { name: 'range', in: 'query', required: false, schema: { type: 'string' } },
        ],
        responses: { 200: { description: 'Spreadsheet values and deterministic analysis' } },
      },
    },
    '/tools/google-sheets/{id}/append': {
      post: {
        tags: ['Google Sheets'],
        summary: 'Append rows to a Google Spreadsheet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Rows appended' } },
      },
    },
    '/tools/google-sheets/{id}/update': {
      post: {
        tags: ['Google Sheets'],
        summary: 'Update range in a Google Spreadsheet',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Range updated' } },
      },
    },
    '/tools/google-docs/create': {
      post: {
        tags: ['Google Docs'],
        summary: 'Create a Google Doc in the authenticated user account',
        responses: { 201: { description: 'Document created with URL' } },
      },
    },
    '/tools/google-docs/{id}': {
      get: {
        tags: ['Google Docs'],
        summary: 'Read a Google Doc by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Document content' } },
      },
    },
    '/tools/google-docs/{id}/update': {
      post: {
        tags: ['Google Docs'],
        summary: 'Append or update content in a Google Doc',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Document updated' } },
      },
    },
    '/integrations/telegram/connect': {
      post: {
        tags: ['Telegram'],
        summary: 'Connect and validate a Telegram Bot via getMe',
        responses: { 200: { description: 'Telegram Bot connected' } },
      },
    },
    '/integrations/telegram/status': {
      get: {
        tags: ['Telegram'],
        summary: 'Get Telegram Bot connection and linked chat status',
        responses: { 200: { description: 'Telegram status' } },
      },
    },
    '/integrations/telegram/link-chat': {
      post: {
        tags: ['Telegram'],
        summary: 'Validate and link a Telegram Chat ID to the authenticated user',
        responses: { 200: { description: 'Chat linked' } },
      },
    },
    '/integrations/telegram/webhook': {
      post: {
        tags: ['Telegram'],
        summary: 'Receive Telegram Bot webhook updates (validated with secret header)',
        security: [],
        responses: { 200: { description: 'Webhook handled' } },
      },
    },
    '/tools/telegram/send-message': {
      post: {
        tags: ['Telegram'],
        summary: 'Send a message to the user linked Telegram chat',
        responses: { 200: { description: 'Message delivered' } },
      },
    },
    '/integrations/telegram/disconnect': {
      delete: {
        tags: ['Telegram'],
        summary: 'Disconnect Telegram Bot and remove encrypted token',
        responses: { 200: { description: 'Disconnected' } },
      },
    },
    '/agents': {
      get: {
        tags: ['Agents'],
        summary: 'List user specialist agents (Coordinator, Researcher, Analyst, Writer, Developer)',
        responses: { 200: { description: 'List of agents' } },
      },
      post: {
        tags: ['Agents'],
        summary: 'Create a custom specialist agent configuration',
        responses: { 201: { description: 'Agent created' } },
      },
    },
    '/agents/{id}': {
      get: {
        tags: ['Agents'],
        summary: 'Get agent details by ID',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Agent details' } },
      },
      patch: {
        tags: ['Agents'],
        summary: 'Update agent instructions or status',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Agent updated' } },
      },
    },
    '/tasks': {
      post: {
        tags: ['Tasks'],
        summary: 'Submit an autonomous task objective to the Coordinator Agent',
        responses: { 201: { description: 'Task planned and executed' } },
      },
      get: {
        tags: ['Tasks'],
        summary: 'List user tasks with pagination',
        responses: { 200: { description: 'Paginated tasks' } },
      },
    },
    '/tasks/{id}': {
      get: {
        tags: ['Tasks'],
        summary: 'Get task status, plan, steps, and final outputs',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task details' } },
      },
    },
    '/tasks/{id}/cancel': {
      post: {
        tags: ['Tasks'],
        summary: 'Cancel an active or waiting task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task cancelled' } },
      },
    },
    '/tasks/{id}/executions': {
      get: {
        tags: ['Tasks'],
        summary: 'Get full audit trail of task steps, agent executions, tool executions, and approvals',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Task execution trace' } },
      },
    },
    '/approvals': {
      get: {
        tags: ['Approvals'],
        summary: 'List all approvals for the authenticated user',
        responses: { 200: { description: 'Approvals list' } },
      },
    },
    '/approvals/pending': {
      get: {
        tags: ['Approvals'],
        summary: 'List all pending human-in-the-loop approval requests for the user',
        responses: { 200: { description: 'Pending approvals' } },
      },
    },
    '/approvals/{id}': {
      get: {
        tags: ['Approvals'],
        summary: 'Get details of a specific approval record',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Approval details' } },
      },
    },
    '/approvals/{id}/approve': {
      post: {
        tags: ['Approvals'],
        summary: 'Approve a pending protected action and resume the paused task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Approved and resumed' } },
      },
    },
    '/approvals/{id}/reject': {
      post: {
        tags: ['Approvals'],
        summary: 'Reject a pending protected action and terminate the paused task',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Rejected and cancelled' } },
      },
    },
    '/memory': {
      get: {
        tags: ['Memory'],
        summary: 'List or search persistent user memories',
        responses: { 200: { description: 'Memories retrieved' } },
      },
      post: {
        tags: ['Memory'],
        summary: 'Store a new persistent user memory or preference',
        responses: { 201: { description: 'Memory stored' } },
      },
    },
    '/memory/{id}': {
      patch: {
        tags: ['Memory'],
        summary: 'Update an existing user memory',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Memory updated' } },
      },
      delete: {
        tags: ['Memory'],
        summary: 'Delete a user memory',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Memory deleted' } },
      },
    },
    '/workspace/files': {
      get: {
        tags: ['Workspace'],
        summary: 'List files in the authenticated user workspace',
        responses: { 200: { description: 'Workspace files' } },
      },
    },
    '/workspace/upload': {
      post: {
        tags: ['Workspace'],
        summary: 'Upload a file (CSV, MD, TXT, JSON) to the user workspace',
        responses: { 201: { description: 'File uploaded' } },
      },
    },
    '/workspace/files/{id}': {
      get: {
        tags: ['Workspace'],
        summary: 'Get file metadata and text content',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'File metadata & content' } },
      },
      delete: {
        tags: ['Workspace'],
        summary: 'Delete a file from the user workspace',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'File deleted' } },
      },
    },
    '/workspace/files/{id}/download': {
      get: {
        tags: ['Workspace'],
        summary: 'Download a file from the user workspace',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'File stream' } },
      },
    },
    '/automations': {
      get: {
        tags: ['Automations'],
        summary: 'List saved reusable workflows (includes predefined Sales Report Automation)',
        responses: { 200: { description: 'Automations list' } },
      },
      post: {
        tags: ['Automations'],
        summary: 'Create a reusable automation workflow',
        responses: { 201: { description: 'Automation created' } },
      },
    },
    '/automations/{id}': {
      get: {
        tags: ['Automations'],
        summary: 'Get automation definition and recent executions',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Automation details' } },
      },
    },
    '/automations/{id}/run': {
      post: {
        tags: ['Automations'],
        summary: 'Execute a saved automation workflow',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 201: { description: 'Automation executed' } },
      },
    },
    '/automations/{id}/executions': {
      get: {
        tags: ['Automations'],
        summary: 'List execution history for an automation',
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: { 200: { description: 'Execution history' } },
      },
    },
  },
};
