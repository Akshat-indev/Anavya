import { Router } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { authenticateJWT } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';
import {
  registerSchema,
  loginSchema,
  createAgentSchema,
  updateAgentSchema,
  testAgentSchema,
  createConversationSchema,
  updateConversationSchema,
  createChatMessageSchema,
  createTaskSchema,
  createMemorySchema,
  updateMemorySchema,
  resolveApprovalSchema,
  createAutomationSchema,
  runAutomationSchema,
  googleSheetsModifySchema,
  googleDocsCreateSchema,
  googleDocsUpdateSchema,
  googleDriveUploadSchema,
  gmailDraftSchema,
  googleQuickConnectSchema,
  telegramConnectSchema,
  telegramLinkChatSchema,
  telegramSendMessageSchema,
} from '../schemas';
import { authController } from '../controllers/auth.controller';
import { agentController } from '../controllers/agent.controller';
import { chatController } from '../controllers/chat.controller';
import { integrationController } from '../controllers/integration.controller';
import { taskController } from '../controllers/task.controller';
import { approvalController } from '../controllers/approval.controller';
import { memoryController } from '../controllers/memory.controller';
import { workspaceController } from '../controllers/workspace.controller';
import { automationController } from '../controllers/automation.controller';
import { systemController } from '../controllers/system.controller';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: env.MAX_UPLOAD_SIZE_MB * 1024 * 1024,
  },
});

// System
router.get('/health', (req, res, next) => systemController.health(req, res, next));
router.get('/tools', authenticateJWT, (req, res, next) => systemController.listTools(req, res, next));
router.get('/events', (req, res, next) => chatController.streamEvents(req, res, next));

// Authentication
router.post('/auth/register', validateBody(registerSchema), (req, res, next) =>
  authController.register(req, res, next)
);
router.post('/auth/login', validateBody(loginSchema), (req, res, next) =>
  authController.login(req, res, next)
);
router.get('/auth/google', (req, res, next) =>
  integrationController.googleAuthLogin(req, res, next)
);
router.get('/auth/me', authenticateJWT, (req, res, next) => authController.me(req, res, next));

// Chat Conversations & Messages
router.post(
  '/chat/conversations',
  authenticateJWT,
  validateBody(createConversationSchema),
  (req, res, next) => chatController.createConversation(req, res, next)
);
router.get('/chat/conversations', authenticateJWT, (req, res, next) =>
  chatController.listConversations(req, res, next)
);
router.get('/chat/conversations/:id', authenticateJWT, (req, res, next) =>
  chatController.getConversationById(req, res, next)
);
router.patch(
  '/chat/conversations/:id',
  authenticateJWT,
  validateBody(updateConversationSchema),
  (req, res, next) => chatController.updateConversation(req, res, next)
);
router.delete('/chat/conversations/:id', authenticateJWT, (req, res, next) =>
  chatController.deleteConversation(req, res, next)
);
router.post(
  '/chat/conversations/:id/messages',
  authenticateJWT,
  validateBody(createChatMessageSchema),
  (req, res, next) => chatController.sendMessage(req, res, next)
);

// Agents
router.get('/agents', authenticateJWT, (req, res, next) =>
  agentController.listAgents(req, res, next)
);
router.post('/agents/test', authenticateJWT, validateBody(testAgentSchema), (req, res, next) =>
  agentController.testAgent(req, res, next)
);
router.post('/agents', authenticateJWT, validateBody(createAgentSchema), (req, res, next) =>
  agentController.createAgent(req, res, next)
);
router.get('/agents/:id', authenticateJWT, (req, res, next) =>
  agentController.getAgentById(req, res, next)
);
router.patch('/agents/:id', authenticateJWT, validateBody(updateAgentSchema), (req, res, next) =>
  agentController.updateAgent(req, res, next)
);
router.post('/agents/:id/duplicate', authenticateJWT, (req, res, next) =>
  agentController.duplicateAgent(req, res, next)
);
router.delete('/agents/:id', authenticateJWT, (req, res, next) =>
  agentController.deleteAgent(req, res, next)
);

// Google OAuth & Workspace Integrations
router.get('/integrations/google/connect', authenticateJWT, (req, res, next) =>
  integrationController.googleConnect(req, res, next)
);
router.get('/integrations/google/callback', (req, res, next) =>
  integrationController.googleCallback(req, res, next)
);
router.get('/integrations/google/status', authenticateJWT, (req, res, next) =>
  integrationController.googleStatus(req, res, next)
);
router.delete('/integrations/google/disconnect', authenticateJWT, (req, res, next) =>
  integrationController.googleDisconnect(req, res, next)
);
router.get('/integrations/google/spreadsheets', authenticateJWT, (req, res, next) =>
  integrationController.listSpreadsheets(req, res, next)
);

// Google Sheets Tools
router.get('/tools/google-sheets/:id/read', authenticateJWT, (req, res, next) =>
  integrationController.readSpreadsheet(req, res, next)
);
router.post(
  '/tools/google-sheets/:id/append',
  authenticateJWT,
  validateBody(googleSheetsModifySchema),
  (req, res, next) => integrationController.appendSpreadsheetRows(req, res, next)
);
router.post(
  '/tools/google-sheets/:id/update',
  authenticateJWT,
  validateBody(googleSheetsModifySchema),
  (req, res, next) => integrationController.updateSpreadsheetRange(req, res, next)
);

// Google Docs Tools
router.post(
  '/tools/google-docs/create',
  authenticateJWT,
  validateBody(googleDocsCreateSchema),
  (req, res, next) => integrationController.createGoogleDoc(req, res, next)
);
router.get('/tools/google-docs/:id', authenticateJWT, (req, res, next) =>
  integrationController.readGoogleDoc(req, res, next)
);
router.post(
  '/tools/google-docs/:id/update',
  authenticateJWT,
  validateBody(googleDocsUpdateSchema),
  (req, res, next) => integrationController.updateGoogleDoc(req, res, next)
);

// Google Drive Tools
router.get('/tools/google-drive/files', authenticateJWT, (req, res, next) =>
  integrationController.listDriveFiles(req, res, next)
);
router.get('/tools/google-drive/search', authenticateJWT, (req, res, next) =>
  integrationController.searchDriveFiles(req, res, next)
);
router.get('/tools/google-drive/files/:id', authenticateJWT, (req, res, next) =>
  integrationController.getDriveFileMetadata(req, res, next)
);
router.post(
  '/tools/google-drive/upload',
  authenticateJWT,
  validateBody(googleDriveUploadSchema),
  (req, res, next) => integrationController.uploadDriveFile(req, res, next)
);

// Gmail Tools
router.get('/tools/gmail/messages', authenticateJWT, (req, res, next) =>
  integrationController.listGmailMessages(req, res, next)
);
router.get('/tools/gmail/search', authenticateJWT, (req, res, next) =>
  integrationController.searchGmailMessages(req, res, next)
);
router.get('/tools/gmail/messages/:id', authenticateJWT, (req, res, next) =>
  integrationController.getGmailMessage(req, res, next)
);
router.post(
  '/tools/gmail/drafts',
  authenticateJWT,
  validateBody(gmailDraftSchema),
  (req, res, next) => integrationController.createGmailDraft(req, res, next)
);
router.post(
  '/tools/gmail/send',
  authenticateJWT,
  validateBody(gmailDraftSchema),
  (req, res, next) => integrationController.sendGmailMessage(req, res, next)
);

// Telegram Integrations & Tools
router.post(
  '/integrations/telegram/connect',
  authenticateJWT,
  validateBody(telegramConnectSchema),
  (req, res, next) => integrationController.telegramConnect(req, res, next)
);
router.get('/integrations/telegram/status', authenticateJWT, (req, res, next) =>
  integrationController.telegramStatus(req, res, next)
);
router.post(
  '/integrations/telegram/link-chat',
  authenticateJWT,
  validateBody(telegramLinkChatSchema),
  (req, res, next) => integrationController.telegramLinkChat(req, res, next)
);
router.post('/integrations/telegram/webhook', (req, res, next) =>
  integrationController.telegramWebhook(req, res, next)
);
router.post(
  '/tools/telegram/send-message',
  authenticateJWT,
  validateBody(telegramSendMessageSchema),
  (req, res, next) => integrationController.telegramSendMessage(req, res, next)
);
router.delete('/integrations/telegram/disconnect', authenticateJWT, (req, res, next) =>
  integrationController.telegramDisconnect(req, res, next)
);

// Tasks
router.post('/tasks', authenticateJWT, validateBody(createTaskSchema), (req, res, next) =>
  taskController.createTask(req, res, next)
);
router.get('/tasks', authenticateJWT, (req, res, next) =>
  taskController.listTasks(req, res, next)
);
router.get('/tasks/:id', authenticateJWT, (req, res, next) =>
  taskController.getTaskById(req, res, next)
);
router.post('/tasks/:id/cancel', authenticateJWT, (req, res, next) =>
  taskController.cancelTask(req, res, next)
);
router.get('/tasks/:id/executions', authenticateJWT, (req, res, next) =>
  taskController.getTaskExecutions(req, res, next)
);

// Approvals
router.get('/approvals', authenticateJWT, (req, res, next) =>
  approvalController.listApprovals(req, res, next)
);
router.get('/approvals/pending', authenticateJWT, (req, res, next) =>
  approvalController.listPending(req, res, next)
);
router.get('/approvals/:id', authenticateJWT, (req, res, next) =>
  approvalController.getApprovalById(req, res, next)
);
router.post(
  '/approvals/:id/approve',
  authenticateJWT,
  validateBody(resolveApprovalSchema),
  (req, res, next) => approvalController.approve(req, res, next)
);
router.post(
  '/approvals/:id/reject',
  authenticateJWT,
  validateBody(resolveApprovalSchema),
  (req, res, next) => approvalController.reject(req, res, next)
);

// Memory
router.get('/memory', authenticateJWT, (req, res, next) =>
  memoryController.listMemories(req, res, next)
);
router.post('/memory', authenticateJWT, validateBody(createMemorySchema), (req, res, next) =>
  memoryController.createMemory(req, res, next)
);
router.patch('/memory/:id', authenticateJWT, validateBody(updateMemorySchema), (req, res, next) =>
  memoryController.updateMemory(req, res, next)
);
router.delete('/memory/:id', authenticateJWT, (req, res, next) =>
  memoryController.deleteMemory(req, res, next)
);

// Workspace
router.get('/workspace/files', authenticateJWT, (req, res, next) =>
  workspaceController.listFiles(req, res, next)
);
router.post(
  '/workspace/upload',
  authenticateJWT,
  upload.single('file'),
  (req, res, next) => workspaceController.uploadFile(req, res, next)
);
router.get('/workspace/files/:id', authenticateJWT, (req, res, next) =>
  workspaceController.getFileDetails(req, res, next)
);
router.get('/workspace/files/:id/download', authenticateJWT, (req, res, next) =>
  workspaceController.downloadFile(req, res, next)
);
router.delete('/workspace/files/:id', authenticateJWT, (req, res, next) =>
  workspaceController.deleteFile(req, res, next)
);

// Automations
router.get('/automations', authenticateJWT, (req, res, next) =>
  automationController.listAutomations(req, res, next)
);
router.post(
  '/automations',
  authenticateJWT,
  validateBody(createAutomationSchema),
  (req, res, next) => automationController.createAutomation(req, res, next)
);
router.get('/automations/:id', authenticateJWT, (req, res, next) =>
  automationController.getAutomationById(req, res, next)
);
router.post(
  '/automations/:id/run',
  authenticateJWT,
  validateBody(runAutomationSchema),
  (req, res, next) => automationController.runAutomation(req, res, next)
);
router.get('/automations/:id/executions', authenticateJWT, (req, res, next) =>
  automationController.getAutomationExecutions(req, res, next)
);

export default router;
