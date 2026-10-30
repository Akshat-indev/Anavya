import fs from 'fs';
import path from 'path';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import app from '../src/app';
import { resetFallbackStore } from '../src/config/db';
import { toolRegistryService } from '../src/services/tools/tool-registry.service';
import { geminiService } from '../src/services/ai/gemini.service';
import { executionPlanSchema } from '../src/schemas';

const SAMPLE_CSV_PATH = path.resolve(__dirname, '../samples/sample_sales.csv');

describe('TaskForce AI Backend MVP — Complete Verification Suite', () => {
  let user1Token = '';
  let user1Id = '';
  let user2Token = '';
  let user2Id = '';
  let uploadedCsvFileId = '';

  beforeAll(() => {
    resetFallbackStore();
  });

  afterAll(() => {
    // Clean up test user workspace directories if created
    const wsRoot = path.resolve(process.cwd(), 'workspace', 'users');
    if (user1Id && fs.existsSync(path.join(wsRoot, user1Id))) {
      fs.rmSync(path.join(wsRoot, user1Id), { recursive: true, force: true });
    }
    if (user2Id && fs.existsSync(path.join(wsRoot, user2Id))) {
      fs.rmSync(path.join(wsRoot, user2Id), { recursive: true, force: true });
    }
  });

  describe('1. System Health & Swagger Docs', () => {
    it('GET /api/v1/health returns healthy status and Gemini configuration', async () => {
      const res = await request(app).get('/api/v1/health');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('healthy');
      expect(res.body.data.aiProvider).toContain('Google Gemini');
    });

    it('GET /api-docs.json exposes OpenAPI specification', async () => {
      const res = await request(app).get('/api-docs.json');
      expect(res.status).toBe(200);
      expect(res.body.openapi).toBe('3.0.3');
      expect(res.body.paths['/tasks']).toBeDefined();
    });
  });

  describe('2. Registration, Login, JWT Auth & Protected Endpoints', () => {
    it('POST /api/v1/auth/register creates User 1 and returns JWT token', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'alice@taskforce.ai',
        password: 'Password123!',
      });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.email).toBe('alice@taskforce.ai');
      user1Token = res.body.data.token;
      user1Id = res.body.data.user.id;
    });

    it('POST /api/v1/auth/register creates User 2 for isolation testing', async () => {
      const res = await request(app).post('/api/v1/auth/register').send({
        email: 'bob@taskforce.ai',
        password: 'Password123!',
      });
      expect(res.status).toBe(201);
      user2Token = res.body.data.token;
      user2Id = res.body.data.user.id;
    });

    it('POST /api/v1/auth/login authenticates valid user and rejects wrong password', async () => {
      const okRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@taskforce.ai',
        password: 'Password123!',
      });
      expect(okRes.status).toBe(200);
      expect(okRes.body.data.token).toBeDefined();

      const badRes = await request(app).post('/api/v1/auth/login').send({
        email: 'alice@taskforce.ai',
        password: 'WrongPassword',
      });
      expect(badRes.status).toBe(401);
      expect(badRes.body.success).toBe(false);
    });

    it('GET /api/v1/auth/me blocks unauthenticated requests and succeeds with valid JWT', async () => {
      const unauth = await request(app).get('/api/v1/auth/me');
      expect(unauth.status).toBe(401);

      const auth = await request(app)
        .get('/api/v1/auth/me')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(auth.status).toBe(200);
      expect(auth.body.data.user.email).toBe('alice@taskforce.ai');
    });
  });

  describe('3. Specialist Agents & Tool Registry Validation', () => {
    it('GET /api/v1/agents returns the 5 default specialist agents for User 1', async () => {
      const res = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.agents.length).toBe(5);
      const roles = res.body.data.agents.map((a: any) => a.role);
      expect(roles).toEqual(
        expect.arrayContaining(['coordinator', 'researcher', 'analyst', 'writer', 'developer'])
      );
    });

    it('GET /api/v1/tools returns registered allowlisted backend tools', async () => {
      const res = await request(app)
        .get('/api/v1/tools')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(res.status).toBe(200);
      const toolNames = res.body.data.tools.map((t: any) => t.name);
      expect(toolNames).toEqual(
        expect.arrayContaining([
          'web_research',
          'file_reader',
          'file_writer',
          'csv_analyzer',
          'approval_protected_action',
        ])
      );
    });

    it('Tool Registry rejects unknown tools and unauthorized agent roles', async () => {
      await expect(
        toolRegistryService.executeTool('shell_exec', {}, {
          userId: user1Id,
          taskId: 'test-task',
          agentType: 'developer',
        })
      ).rejects.toThrow(/not in the registered tool allowlist/);

      await expect(
        toolRegistryService.executeTool('csv_analyzer', { filename: 'sales.csv' }, {
          userId: user1Id,
          taskId: 'test-task',
          agentType: 'researcher', // Researcher is not permitted to run csv_analyzer
        })
      ).rejects.toThrow(/does not have permission/);
    });

    it('Deterministic CSV Analyzer calculates exact sums, averages, and top 5 products', () => {
      const csvText = fs.readFileSync(SAMPLE_CSV_PATH, 'utf-8');
      const analysis = toolRegistryService.analyzeCsvContent('sample_sales.csv', csvText, 5);
      expect(analysis.rowCount).toBe(12);
      expect(analysis.columnCount).toBe(6);
      // 6750+4200+6800+5000+7500+4500+6000+4500+6300+6000+4000+5400 = 66950
      expect(analysis.GrandTotalRevenue).toBe(66950);
      expect(analysis.topProductsByRevenue?.length).toBe(5);
      expect(analysis.topProductsByRevenue?.[0].product).toBe('Enterprise AI Copilot');
      expect(analysis.topProductsByRevenue?.[0].totalRevenue).toBe(16650);
    });
  });

  describe('4. Gemini Service Validation & Structured Plan Validation', () => {
    it('Validates structured execution plans using Zod', () => {
      const validPlan = {
        objectiveSummary: 'Analyze CSV and write report',
        workType: 'data_analysis',
        steps: [
          {
            sequence: 1,
            agentType: 'analyst',
            description: 'Analyze sales CSV',
            requiredTools: ['csv_analyzer'],
          },
        ],
      };
      const parsed = executionPlanSchema.safeParse(validPlan);
      expect(parsed.success).toBe(true);

      const invalidPlan = {
        objectiveSummary: 'Invalid agent role',
        workType: 'data_analysis',
        steps: [
          {
            sequence: 1,
            agentType: 'hacker_agent',
            description: 'Invalid role',
            requiredTools: [],
          },
        ],
      };
      expect(executionPlanSchema.safeParse(invalidPlan).success).toBe(false);
    });

    it('Redacts sensitive credentials before sending prompts to Gemini', () => {
      const sanitized = geminiService.sanitizeInput('My password=superSecret123 and api_key:AIzaSy12345');
      expect(sanitized).toContain('[REDACTED_SENSITIVE]');
      expect(sanitized).not.toContain('superSecret123');
    });
  });

  describe('5. Persistent Memory & User Isolation', () => {
    let memoryId = '';

    it('Stores, retrieves, and updates user-scoped memory, and blocks secrets', async () => {
      const createRes = await request(app)
        .post('/api/v1/memory')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          category: 'user_preference',
          content: 'Prefer executive summaries with Markdown tables and top 5 product rankings.',
        });
      expect(createRes.status).toBe(201);
      memoryId = createRes.body.data.memory.id;

      // Block storing secrets in memory
      const secretRes = await request(app)
        .post('/api/v1/memory')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          category: 'user_preference',
          content: 'My password=MySecretPassword123',
        });
      expect(secretRes.status).toBe(400);

      // List memories for User 1
      const listRes = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.items.length).toBeGreaterThanOrEqual(1);

      // User 2 cannot see or delete User 1's memory
      const user2List = await request(app)
        .get('/api/v1/memory')
        .set('Authorization', `Bearer ${user2Token}`);
      expect(user2List.body.data.items.length).toBe(0);

      const user2Delete = await request(app)
        .delete(`/api/v1/memory/${memoryId}`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(user2Delete.status).toBe(404);
    });
  });

  describe('6. Workspace File Upload & Isolation + DEMO 1: End-to-End Sales CSV Workflow', () => {
    it('Uploads sample_sales.csv to User 1 workspace and enforces cross-user file isolation', async () => {
      const uploadRes = await request(app)
        .post('/api/v1/workspace/upload')
        .set('Authorization', `Bearer ${user1Token}`)
        .attach('file', SAMPLE_CSV_PATH);

      expect(uploadRes.status).toBe(201);
      expect(uploadRes.body.data.file.filename).toBe('sample_sales.csv');
      uploadedCsvFileId = uploadRes.body.data.file.id;

      // User 2 cannot access User 1's uploaded file
      const forbiddenRes = await request(app)
        .get(`/api/v1/workspace/files/${uploadedCsvFileId}`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(forbiddenRes.status).toBe(404);
    });

    it('Executes the mandatory Sales CSV End-to-End Workflow (Coordinator -> CSV Analyzer -> Analyst -> Writer -> File Writer -> Memory)', async () => {
      const taskRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Q3 Sales Performance Analysis',
          description:
            'Analyze this sales CSV. Calculate total revenue, identify the top five products, compare their performance, and generate a professional report.',
        });

      expect(taskRes.status).toBe(201);
      const task = taskRes.body.data.task;
      expect(task.status).toBe('completed');
      expect(task.steps.length).toBeGreaterThanOrEqual(2);
      expect(task.finalOutput.artifacts.length).toBeGreaterThanOrEqual(1);

      const reportArtifact = task.finalOutput.artifacts[0];
      expect(reportArtifact.filename).toContain('.md');

      // Verify the report file actually exists in User 1's workspace and contains real numbers
      const fileRes = await request(app)
        .get(`/api/v1/workspace/files/${reportArtifact.fileId}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(fileRes.status).toBe(200);
      const reportContent = fileRes.body.data.file.content;
      expect(reportContent).toContain('Executive Summary');
      expect(reportContent).toContain('66950'); // Exact deterministic total revenue
      expect(reportContent).toContain('Enterprise AI Copilot'); // Top 1 product

      // Verify execution audit history (steps, agentExecutions, toolExecutions)
      const execRes = await request(app)
        .get(`/api/v1/tasks/${task.id}/executions`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(execRes.status).toBe(200);
      expect(execRes.body.data.agentExecutions.length).toBeGreaterThanOrEqual(3); // Coordinator + Analyst + Writer
      expect(execRes.body.data.toolExecutions.length).toBeGreaterThanOrEqual(2); // csv_analyzer + file_writer
    });
  });

  describe('7. DEMO 2: Human Approval Workflow (Pause, Approve, and Reject)', () => {
    it('Pauses task when an email action requires approval, then resumes and records safe simulated action upon user approval', async () => {
      const taskRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          title: 'Client Email Summary',
          description: 'Prepare an email summarizing this report and send it to the client.',
        });

      expect(taskRes.status).toBe(201);
      const pausedTask = taskRes.body.data.task;
      expect(pausedTask.status).toBe('waiting_for_approval');

      // Retrieve pending approvals
      const pendingRes = await request(app)
        .get('/api/v1/approvals/pending')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(pendingRes.status).toBe(200);
      expect(pendingRes.body.data.approvals.length).toBe(1);

      const approvalId = pendingRes.body.data.approvals[0].id;

      // User 2 cannot approve User 1's action
      const unauthorizedApprove = await request(app)
        .post(`/api/v1/approvals/${approvalId}/approve`)
        .set('Authorization', `Bearer ${user2Token}`)
        .send({ reason: 'Malicious approval' });
      expect(unauthorizedApprove.status).toBe(404);

      // User 1 approves the action
      const approveRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/approve`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ reason: 'Reviewed email draft, looks great for client.' });

      expect(approveRes.status).toBe(200);
      expect(approveRes.body.data.approval.status).toBe('executed');
      expect(approveRes.body.data.executionResult.simulated).toBe(true);
      expect(approveRes.body.data.executionResult.emailActuallySent).toBe(false);
      expect(approveRes.body.data.task.status).toBe('completed');
    });

    it('Terminates task cleanly when user rejects a pending approval', async () => {
      const taskRes = await request(app)
        .post('/api/v1/tasks')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          description: 'Prepare an email summarizing this report and send it to the client.',
        });
      const approvalId = taskRes.body.data.task.approvals[0].id;

      const rejectRes = await request(app)
        .post(`/api/v1/approvals/${approvalId}/reject`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ reason: 'Do not send to client yet.' });

      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.data.approval.status).toBe('rejected');
      expect(rejectRes.body.data.task.status).toBe('cancelled');
    });
  });

  describe('8. Reusable Automations (Sales Report Automation)', () => {
    it('Lists predefined Sales Report Automation and executes it end-to-end', async () => {
      const listRes = await request(app)
        .get('/api/v1/automations')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.automations.length).toBeGreaterThanOrEqual(1);

      const salesAutomation = listRes.body.data.automations.find(
        (a: any) => a.name === 'Sales Report Automation'
      );
      expect(salesAutomation).toBeDefined();

      const runRes = await request(app)
        .post(`/api/v1/automations/${salesAutomation.id}/run`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ fileId: uploadedCsvFileId });

      expect(runRes.status).toBe(201);
      expect(runRes.body.data.automationExecution.status).toBe('completed');
      expect(runRes.body.data.task.status).toBe('completed');

      const historyRes = await request(app)
        .get(`/api/v1/automations/${salesAutomation.id}/executions`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(historyRes.status).toBe(200);
      expect(historyRes.body.data.executions.length).toBe(1);
    });
  });

  describe('9. Chat-First Conversations, Google Workspace (Sheets & Docs), and Telegram Integration', () => {
    let conversationId = '';

    it('Creates, lists, renames, and retrieves persistent chat conversations', async () => {
      const createRes = await request(app)
        .post('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ title: 'Sales Outbound', agentRole: 'coordinator' });

      expect(createRes.status).toBe(201);
      conversationId = createRes.body.data.conversation.id;
      expect(createRes.body.data.conversation.title).toBe('Sales Outbound');

      const patchRes = await request(app)
        .patch(`/api/v1/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user1Token}`)
        .send({ title: 'Monthly Sales Analysis' });
      expect(patchRes.status).toBe(200);
      expect(patchRes.body.data.conversation.title).toBe('Monthly Sales Analysis');

      const listRes = await request(app)
        .get('/api/v1/chat/conversations')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(listRes.status).toBe(200);
      expect(listRes.body.data.conversations.length).toBeGreaterThanOrEqual(1);

      // User 2 cannot access User 1's conversation
      const user2Get = await request(app)
        .get(`/api/v1/chat/conversations/${conversationId}`)
        .set('Authorization', `Bearer ${user2Token}`);
      expect(user2Get.status).toBe(404);
    });

    it('Generates Google OAuth state, stores encrypted Google tokens, and mocks Google Sheets & Docs APIs', async () => {
      const connectRes = await request(app)
        .get('/api/v1/integrations/google/connect')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(connectRes.status).toBe(200);
      expect(connectRes.body.data.state).toContain(user1Id);

      // Save encrypted Google tokens for User 1
      const { googleIntegrationService } = await import(
        '../src/services/integrations/google.service'
      );
      await googleIntegrationService.saveGoogleTokens(user1Id, {
        accessToken: 'ya29.mock_access_token_123',
        refreshToken: '1//mock_refresh_token_456',
        expiresIn: 3600,
        accountEmail: 'alice@company.com',
        accountName: 'Alice Workspace',
      });

      const statusRes = await request(app)
        .get('/api/v1/integrations/google/status')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.connected).toBe(true);
      expect(statusRes.body.data.accountEmail).toBe('alice@company.com');
      // Ensure tokens are never exposed in status response
      expect(JSON.stringify(statusRes.body)).not.toContain('ya29.mock_access_token_123');
    });

    it('Validates Telegram Bot connection, chat linking, webhook secret validation, and full multi-tool chat execution', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (urlInput: any, init?: any) => {
        const url = String(urlInput);
        if (url.includes('api.telegram.org')) {
          if (url.endsWith('/getMe')) {
            return new Response(
              JSON.stringify({
                ok: true,
                result: { id: 998877, is_bot: true, first_name: 'TaskForceBot', username: 'taskforce_ai_bot' },
              }),
              { status: 200 }
            );
          }
          if (url.endsWith('/getChat')) {
            return new Response(
              JSON.stringify({
                ok: true,
                result: { id: 123456789, title: 'Executive Alerts Group', type: 'group' },
              }),
              { status: 200 }
            );
          }
          if (url.endsWith('/sendMessage')) {
            return new Response(
              JSON.stringify({
                ok: true,
                result: {
                  message_id: 42,
                  chat: { id: 123456789, title: 'Executive Alerts Group' },
                },
              }),
              { status: 200 }
            );
          }
        }
        if (url.includes('sheets.googleapis.com')) {
          if (url.includes('/values/')) {
            return new Response(
              JSON.stringify({
                range: 'Sheet1!A1:F5',
                values: [
                  ['date', 'product', 'category', 'quantity', 'unit_price', 'revenue'],
                  ['2026-09-01', 'Enterprise AI Copilot', 'Software', '15', '450', '6750'],
                  ['2026-09-03', 'Security Shield AI', 'Security', '25', '300', '7500'],
                ],
              }),
              { status: 200 }
            );
          }
          return new Response(
            JSON.stringify({
              spreadsheetId: 'sheet_123',
              properties: { title: 'Q3 Sales Master Sheet' },
              sheets: [{ properties: { title: 'Sheet1' } }],
            }),
            { status: 200 }
          );
        }
        if (url.includes('docs.googleapis.com')) {
          if (url.endsWith(':batchUpdate')) {
            return new Response(JSON.stringify({ documentId: 'gdoc_999' }), { status: 200 });
          }
          return new Response(
            JSON.stringify({ documentId: 'gdoc_999', title: 'Sales Performance Report' }),
            { status: 200 }
          );
        }
        return originalFetch(urlInput, init);
      }) as any;

      try {
        // 1. Connect Telegram Bot & Link Chat
        const tgConnect = await request(app)
          .post('/api/v1/integrations/telegram/connect')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ botToken: '123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11', chatId: '123456789' });
        expect(tgConnect.status).toBe(200);
        expect(tgConnect.body.data.connected).toBe(true);
        expect(tgConnect.body.data.botUsername).toBe('taskforce_ai_bot');
        expect(tgConnect.body.data.linkedChatId).toBe('123456789');

        // 2. Test Webhook Secret Validation
        const badWebhook = await request(app)
          .post('/api/v1/integrations/telegram/webhook')
          .set('x-telegram-bot-api-secret-token', 'wrong_secret')
          .send({ message: { text: 'hi' } });
        expect(badWebhook.status).toBe(401);

        const goodWebhook = await request(app)
          .post('/api/v1/integrations/telegram/webhook')
          .set('x-telegram-bot-api-secret-token', 'taskforce_telegram_webhook_secret')
          .send({ message: { chat: { id: 123456789, title: 'Exec Chat' }, text: '/start' } });
        expect(goodWebhook.status).toBe(200);

        // 3. Execute Final Demonstration Multi-Tool Workflow inside Chat Conversation:
        // "Analyze my sales spreadsheet, identify the top five products, create a professional sales performance report in Google Docs, and notify me on Telegram."
        const msgRes = await request(app)
          .post(`/api/v1/chat/conversations/${conversationId}/messages`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            content:
              'Analyze my sales spreadsheet, identify the top five products, create a professional sales performance report in Google Docs, and notify me on Telegram.',
            spreadsheetId: 'sheet_123',
          });

        expect(msgRes.status).toBe(201);
        const task = msgRes.body.data.task;
        expect(task.status).toBe('waiting_for_approval');

        // Verify Google Sheets was read, Google Doc was created, and Telegram approval is pending
        const pendingApproval = task.approvals.find((a: any) => a.status === 'pending');
        expect(pendingApproval).toBeDefined();
        expect(pendingApproval.actionName).toBe('telegram.send_message');
        expect(pendingApproval.actionArguments.text).toContain(
          'https://docs.google.com/document/d/gdoc_999/edit'
        );

        // 4. Approve the Telegram notification in chat
        const approveRes = await request(app)
          .post(`/api/v1/approvals/${pendingApproval.id}/approve`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({ reason: 'Approve and Send to Telegram' });

        expect(approveRes.status).toBe(200);
        expect(approveRes.body.data.executionResult.delivered).toBe(true);
        expect(approveRes.body.data.task.status).toBe('completed');

        // 5. Verify full conversation messages persisted
        const convRes = await request(app)
          .get(`/api/v1/chat/conversations/${conversationId}`)
          .set('Authorization', `Bearer ${user1Token}`);
        expect(convRes.status).toBe(200);
        const messages = convRes.body.data.conversation.messages;
        expect(messages.length).toBeGreaterThanOrEqual(6);
      } finally {
        global.fetch = originalFetch;
      }
    });
  });

  describe('10. Anavya Agent Configuration Studio, Google Drive, and Gmail Integrations', () => {
    it('Protects core system agents from deletion while allowing custom agent creation, duplication, live studio testing, and deletion', async () => {
      const listRes = await request(app)
        .get('/api/v1/agents')
        .set('Authorization', `Bearer ${user1Token}`);
      expect(listRes.status).toBe(200);
      const systemAgent = listRes.body.data.agents.find((a: any) => a.isSystem === true);
      expect(systemAgent).toBeDefined();

      // Attempting to delete a core system agent must fail with 403
      const delSys = await request(app)
        .delete(`/api/v1/agents/${systemAgent.id}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(delSys.status).toBe(403);
      expect(delSys.body.error.code).toBe('SYSTEM_AGENT_PROTECTED');

      // Create a full custom agent with Sections A-I studio fields
      const createCustom = await request(app)
        .post('/api/v1/agents')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          name: 'Revenue Audit Specialist',
          role: 'analyst',
          description: 'Audits spreadsheets and flags anomalies',
          category: 'Data and Analytics',
          avatar: 'analyst',
          accentColor: '#14B8A6',
          intro: 'I audit your revenue sheets.',
          personality: 'Analytical',
          systemInstructions:
            'You are a senior financial analyst. Always compute totals, top 5 products, and anomalies.',
          enabledTools: ['google_sheets.read', 'csv_analyzer', 'gmail.create_draft'],
          actionPermissions: {
            allowReadOnly: true,
            allowDocCreation: false,
            allowSheetModification: false,
            allowEmailDrafting: true,
            allowEmailSending: false,
            allowTelegramMessaging: false,
            requireApproval: true,
          },
        });
      expect(createCustom.status).toBe(201);
      const customId = createCustom.body.data.agent.id;
      expect(createCustom.body.data.agent.personality).toBe('Analytical');

      // Test the agent in the Section J Live Studio Sandbox
      const testRes = await request(app)
        .post('/api/v1/agents/test')
        .set('Authorization', `Bearer ${user1Token}`)
        .send({
          agentId: customId,
          sampleInstruction:
            'Analyze my sales spreadsheet and send an email via Gmail to client@example.com',
        });
      expect(testRes.status).toBe(200);
      expect(testRes.body.data.testResult.selectedTools.length).toBeGreaterThanOrEqual(2);
      // Since gmail.send_message is not in enabledTools and allowEmailSending is false, it should flag a permission issue
      expect(testRes.body.data.testResult.permissionIssues.length).toBeGreaterThanOrEqual(1);

      // Duplicate the custom agent
      const dupRes = await request(app)
        .post(`/api/v1/agents/${customId}/duplicate`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(dupRes.status).toBe(201);
      expect(dupRes.body.data.agent.name).toContain('(Copy)');

      // Delete the custom agent
      const delCustom = await request(app)
        .delete(`/api/v1/agents/${customId}`)
        .set('Authorization', `Bearer ${user1Token}`);
      expect(delCustom.status).toBe(200);
    });

    it('Supports Google Drive file listing/uploading and Gmail draft creation + approval-gated sending with draft editing', async () => {
      const originalFetch = global.fetch;
      global.fetch = vi.fn(async (urlInput: any, init?: any) => {
        const url = String(urlInput);
        if (url.includes('www.googleapis.com/upload/drive/v3/files')) {
          return new Response(
            JSON.stringify({
              id: 'drive_file_101',
              name: 'q4_strategy_brief.md',
              mimeType: 'text/markdown',
              webViewLink: 'https://drive.google.com/file/d/drive_file_101/view',
            }),
            { status: 200 }
          );
        }
        if (url.includes('www.googleapis.com/drive/v3/files')) {
          return new Response(
            JSON.stringify({
              files: [
                {
                  id: 'drive_file_101',
                  name: 'q4_strategy_brief.md',
                  mimeType: 'text/markdown',
                  size: 128,
                  modifiedTime: new Date().toISOString(),
                  webViewLink: 'https://drive.google.com/file/d/drive_file_101/view',
                },
              ],
            }),
            { status: 200 }
          );
        }
        if (url.includes('gmail.googleapis.com/gmail/v1/users/me/drafts')) {
          return new Response(
            JSON.stringify({
              id: 'draft_555',
              message: { id: 'msg_draft_555', threadId: 'thread_555' },
            }),
            { status: 200 }
          );
        }
        if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/send')) {
          return new Response(
            JSON.stringify({
              id: 'msg_sent_777',
              threadId: 'thread_777',
            }),
            { status: 200 }
          );
        }
        if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages/')) {
          return new Response(
            JSON.stringify({
              id: 'msg_inbox_1',
              threadId: 'thread_inbox_1',
              snippet: 'Q3 sales spreadsheet attached for review.',
              payload: {
                headers: [
                  { name: 'Subject', value: 'Q3 Revenue Numbers' },
                  { name: 'From', value: 'cfo@company.com' },
                  { name: 'To', value: 'alice@company.com' },
                  { name: 'Date', value: '2026-10-30' },
                ],
              },
            }),
            { status: 200 }
          );
        }
        if (url.includes('gmail.googleapis.com/gmail/v1/users/me/messages')) {
          return new Response(
            JSON.stringify({
              messages: [{ id: 'msg_inbox_1', threadId: 'thread_inbox_1' }],
            }),
            { status: 200 }
          );
        }
        return originalFetch(urlInput, init);
      }) as any;

      try {
        // 1. Upload file to Google Drive
        const driveUp = await request(app)
          .post('/api/v1/tools/google-drive/upload')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            filename: 'q4_strategy_brief.md',
            content: '# Q4 Strategy Brief\nKey targets for Q4.',
          });
        expect(driveUp.status).toBe(201);
        expect(driveUp.body.data.name).toBe('q4_strategy_brief.md');

        // 2. Search Google Drive files
        const driveSearch = await request(app)
          .get('/api/v1/tools/google-drive/search?q=strategy')
          .set('Authorization', `Bearer ${user1Token}`);
        expect(driveSearch.status).toBe(200);
        expect(driveSearch.body.data.files.length).toBeGreaterThanOrEqual(1);

        // 3. Create Gmail draft safely without approval
        const gmailDraft = await request(app)
          .post('/api/v1/tools/gmail/drafts')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            recipient: 'board@company.com',
            subject: 'Q4 Strategy Draft',
            body: 'Here is our Q4 strategy brief for review.',
          });
        expect(gmailDraft.status).toBe(201);
        expect(gmailDraft.body.data.draftId).toBe('draft_555');

        // 4. List Gmail messages
        const gmailList = await request(app)
          .get('/api/v1/tools/gmail/messages')
          .set('Authorization', `Bearer ${user1Token}`);
        expect(gmailList.status).toBe(200);
        expect(gmailList.body.data.messages.length).toBeGreaterThanOrEqual(1);
        expect(gmailList.body.data.messages[0].subject).toBe('Q3 Revenue Numbers');

        // 5. Trigger Gmail send workflow in chat and approve with editedDraft
        const taskRes = await request(app)
          .post('/api/v1/tasks')
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            title: 'Send Gmail Executive Update',
            description: 'Send a Gmail email to investor@venture.com with our sales summary.',
          });
        expect(taskRes.status).toBe(201);
        expect(taskRes.body.data.task.status).toBe('waiting_for_approval');

        const approval = taskRes.body.data.task.approvals[0];
        expect(approval.actionName).toBe('gmail.send_message');

        // Approve with editedDraft (simulating user clicking "Edit Draft" -> "Save & Send")
        const approveWithEdit = await request(app)
          .post(`/api/v1/approvals/${approval.id}/approve`)
          .set('Authorization', `Bearer ${user1Token}`)
          .send({
            reason: 'Edited draft and approved',
            editedDraft: {
              recipient: 'partner@venture.com',
              subject: 'Updated Anavya Q3 Revenue Report',
              bodyDraft: 'Hi Partner, here is the updated Q3 revenue summary from Anavya.',
            },
          });
        expect(approveWithEdit.status).toBe(200);
        expect(approveWithEdit.body.data.executionResult.recipient).toBe('partner@venture.com');
        expect(approveWithEdit.body.data.executionResult.subject).toBe(
          'Updated Anavya Q3 Revenue Report'
        );
        expect(approveWithEdit.body.data.task.status).toBe('completed');
      } finally {
        global.fetch = originalFetch;
      }
    });
  });
});
