import { Request, Response, NextFunction } from 'express';
import { AuthenticatedRequest } from '../types';
import { sendSuccess } from '../utils/response';
import { AppError } from '../utils/errors';
import { googleIntegrationService } from '../services/integrations/google.service';
import { telegramIntegrationService } from '../services/integrations/telegram.service';
import { toolRegistryService } from '../services/tools/tool-registry.service';
import { env } from '../config/env';

export class IntegrationController {
  // ==========================================
  // GOOGLE OAUTH & WORKSPACE
  // ==========================================
  public async googleAuthLogin(_req: Request, res: Response, next: NextFunction) {
    try {
      const result = googleIntegrationService.generateLoginAuthUrl();
      return sendSuccess(
        res,
        result,
        result.configured
          ? 'Google OAuth login URL generated'
          : 'Google OAuth client credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured in backend .env yet'
      );
    } catch (err) {
      next(err);
    }
  }

  public async googleConnect(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = googleIntegrationService.generateAuthUrl(userId);
      return sendSuccess(
        res,
        result,
        result.configured
          ? 'Google OAuth authorization URL generated'
          : 'Google OAuth client credentials are not configured in backend .env yet'
      );
    } catch (err) {
      next(err);
    }
  }

  public async googleCallback(req: Request, res: Response, next: NextFunction) {
    try {
      const code = req.query.code ? String(req.query.code) : '';
      const state = req.query.state ? String(req.query.state) : '';
      const error = req.query.error ? String(req.query.error) : '';

      if (error) {
        throw new AppError(`Google OAuth authorization was rejected: ${error}`, 400, 'GOOGLE_OAUTH_REJECTED');
      }

      if (!code || !state) {
        throw new AppError('Missing authorization code or state in Google callback', 400, 'INVALID_OAUTH_CALLBACK');
      }

      const result: any = await googleIntegrationService.handleOAuthCallback(code, state);

      if (req.headers.accept && req.headers.accept.includes('text/html')) {
        if (result?.isLogin && result?.token) {
          return res.redirect(`${env.FRONTEND_URL}/?token=${encodeURIComponent(result.token)}`);
        }
        return res.redirect(`${env.FRONTEND_URL}/plugins?google=connected`);
      }

      if (result?.isLogin) {
        return sendSuccess(res, result, 'Signed in with Google OAuth successfully');
      }

      return sendSuccess(res, { account: result }, 'Google Workspace connected successfully');
    } catch (err) {
      next(err);
    }
  }

  public async googleStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const status = await googleIntegrationService.getConnectionStatus(userId);
      return sendSuccess(res, status, 'Google Workspace connection status retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async googleDisconnect(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await googleIntegrationService.disconnect(userId);
      return sendSuccess(res, result, 'Google Workspace disconnected');
    } catch (err) {
      next(err);
    }
  }

  public async listSpreadsheets(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await googleIntegrationService.listSpreadsheets(userId);
      return sendSuccess(res, result, 'Accessible Google Spreadsheets retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async readSpreadsheet(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const spreadsheetId = String(req.params.id);
      const range = req.query.range ? String(req.query.range) : 'Sheet1!A1:Z500';
      const data = await googleIntegrationService.readSpreadsheet(userId, spreadsheetId, range);

      let analysis = null;
      if (data.csvContent && data.rowCount > 0) {
        try {
          analysis = toolRegistryService.analyzeCsvContent(data.title || 'Sheet.csv', data.csvContent, 5);
        } catch (_e) {
          // Optional deterministic analysis
        }
      }

      return sendSuccess(
        res,
        {
          spreadsheetId: data.spreadsheetId,
          title: data.title,
          sheetNames: data.sheetNames,
          range: data.range,
          rowCount: data.rowCount,
          headers: data.headers,
          rows: data.rows,
          analysis,
        },
        'Spreadsheet read successfully'
      );
    } catch (err) {
      next(err);
    }
  }

  public async appendSpreadsheetRows(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const spreadsheetId = String(req.params.id);
      const { range, values } = req.body;
      const result = await googleIntegrationService.appendRows(userId, spreadsheetId, range, values);
      return sendSuccess(res, result, 'Rows appended to Google Spreadsheet');
    } catch (err) {
      next(err);
    }
  }

  public async updateSpreadsheetRange(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const spreadsheetId = String(req.params.id);
      const { range, values } = req.body;
      const result = await googleIntegrationService.updateRange(userId, spreadsheetId, range, values);
      return sendSuccess(res, result, 'Google Spreadsheet range updated');
    } catch (err) {
      next(err);
    }
  }

  public async createGoogleDoc(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { title, content, conversationId, taskId } = req.body;
      const result = await googleIntegrationService.createDocument(userId, title, content, {
        conversationId,
        taskId,
      });
      return sendSuccess(res, result, 'Google Doc created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async readGoogleDoc(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const documentId = String(req.params.id);
      const result = await googleIntegrationService.readDocument(userId, documentId);
      return sendSuccess(res, result, 'Google Doc retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async updateGoogleDoc(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const documentId = String(req.params.id);
      const { content } = req.body;
      const result = await googleIntegrationService.appendDocumentContent(userId, documentId, content);
      return sendSuccess(res, result, 'Google Doc updated');
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // GOOGLE DRIVE TOOLS
  // ==========================================
  public async listDriveFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const pageSize = req.query.pageSize ? Number(req.query.pageSize) : 25;
      const result = await googleIntegrationService.listDriveFiles(userId, pageSize);
      return sendSuccess(res, result, 'Google Drive files retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async searchDriveFiles(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = req.query.q ? String(req.query.q) : '';
      const result = await googleIntegrationService.searchDriveFiles(userId, query);
      return sendSuccess(res, result, 'Google Drive search completed');
    } catch (err) {
      next(err);
    }
  }

  public async getDriveFileMetadata(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const fileId = String(req.params.id);
      const result = await googleIntegrationService.getDriveFileMetadata(userId, fileId);
      return sendSuccess(res, result, 'Google Drive file metadata retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async uploadDriveFile(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { filename, content, mimeType } = req.body;
      const result = await googleIntegrationService.uploadDriveFile(
        userId,
        filename,
        content,
        mimeType || 'text/markdown'
      );
      return sendSuccess(res, result, 'File uploaded to Google Drive', 201);
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // GMAIL TOOLS
  // ==========================================
  public async listGmailMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const maxResults = req.query.maxResults ? Number(req.query.maxResults) : 10;
      const result = await googleIntegrationService.listGmailMessages(userId, maxResults);
      return sendSuccess(res, result, 'Gmail messages retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async searchGmailMessages(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const query = req.query.q ? String(req.query.q) : '';
      const result = await googleIntegrationService.searchGmailMessages(userId, query);
      return sendSuccess(res, result, 'Gmail search completed');
    } catch (err) {
      next(err);
    }
  }

  public async getGmailMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const messageId = String(req.params.id);
      const result = await googleIntegrationService.getGmailMessage(userId, messageId);
      return sendSuccess(res, result, 'Gmail message retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async createGmailDraft(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { recipient, subject, body } = req.body;
      const result = await googleIntegrationService.createGmailDraft(userId, recipient, subject, body);
      return sendSuccess(res, result, 'Gmail draft created successfully', 201);
    } catch (err) {
      next(err);
    }
  }

  public async sendGmailMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { recipient, subject, body } = req.body;
      const result = await googleIntegrationService.sendGmailMessage(userId, recipient, subject, body);
      return sendSuccess(res, result, 'Gmail message sent successfully');
    } catch (err) {
      next(err);
    }
  }

  // ==========================================
  // TELEGRAM BOT INTEGRATION
  // ==========================================
  public async telegramConnect(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { botToken, chatId } = req.body || {};
      const result = await telegramIntegrationService.connectBot(userId, botToken, chatId);
      return sendSuccess(res, result, 'Telegram account connected');
    } catch (err) {
      next(err);
    }
  }

  public async telegramStatus(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const status = await telegramIntegrationService.getStatus(userId);
      return sendSuccess(res, status, 'Telegram status retrieved');
    } catch (err) {
      next(err);
    }
  }

  public async telegramLinkChat(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { chatId } = req.body;
      const result = await telegramIntegrationService.linkChat(userId, chatId);
      return sendSuccess(res, result, 'Telegram chat linked successfully');
    } catch (err) {
      next(err);
    }
  }

  public async telegramWebhook(req: Request, res: Response, next: NextFunction) {
    try {
      const secretHeader = req.headers['x-telegram-bot-api-secret-token'] as string | undefined;
      const result = await telegramIntegrationService.handleWebhook(secretHeader, req.body);
      return sendSuccess(res, result, 'Webhook processed');
    } catch (err) {
      next(err);
    }
  }

  public async telegramSendMessage(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const { text, chatId } = req.body;
      const result = await telegramIntegrationService.sendMessage(userId, text, chatId);
      return sendSuccess(res, result, 'Telegram message sent');
    } catch (err) {
      next(err);
    }
  }

  public async telegramDisconnect(req: AuthenticatedRequest, res: Response, next: NextFunction) {
    try {
      const userId = req.user!.id;
      const result = await telegramIntegrationService.disconnect(userId);
      return sendSuccess(res, result, 'Telegram Bot disconnected');
    } catch (err) {
      next(err);
    }
  }
}

export const integrationController = new IntegrationController();

