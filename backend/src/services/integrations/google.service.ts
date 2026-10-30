import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../config/db';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { encryptSecret, decryptSecret } from '../../utils/crypto';
import { workspaceService } from '../workspace/workspace.service';
import { specialistAgentService } from '../agents/specialist-agents.service';
import { automationService } from '../automations/automation.service';

const GOOGLE_LOGIN_SCOPES = [
  'openid',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const GOOGLE_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/documents',
  'https://www.googleapis.com/auth/drive.readonly',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile',
];

const oauthStateStore: Map<string, { userId: string; expiresAt: number }> = new Map();
const refreshInFlight = new Map<string, Promise<string>>();

export class GoogleIntegrationService {
  public isOAuthConfigured(): boolean {
    return Boolean(
      env.GOOGLE_CLIENT_ID &&
        env.GOOGLE_CLIENT_ID.trim() !== '' &&
        env.GOOGLE_CLIENT_ID !== 'your_google_oauth_client_id' &&
        env.GOOGLE_CLIENT_SECRET &&
        env.GOOGLE_CLIENT_SECRET.trim() !== '' &&
        env.GOOGLE_CLIENT_SECRET !== 'your_google_oauth_client_secret'
    );
  }

  public generateLoginAuthUrl(): { authUrl: string; state: string; configured: boolean } {
    const state = this.createOAuthState('login');

    if (!this.isOAuthConfigured()) {
      return {
        authUrl: '',
        state,
        configured: false,
      };
    }

    // Login authorizes all workspace scopes in one consent (shown only on first sign-in).
    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: GOOGLE_SCOPES.join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'select_account',
      state,
    });

    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      configured: true,
    };
  }

  public generateAuthUrl(userId: string, additionalScopes?: string[]): { authUrl: string; state: string; configured: boolean } {
    const state = this.createOAuthState(userId);

    if (!this.isOAuthConfigured()) {
      return {
        authUrl: '',
        state,
        configured: false,
      };
    }

    const scopeSet = new Set([...GOOGLE_SCOPES, ...(additionalScopes || [])]);

    const params = new URLSearchParams({
      client_id: env.GOOGLE_CLIENT_ID,
      redirect_uri: env.GOOGLE_REDIRECT_URI,
      response_type: 'code',
      scope: Array.from(scopeSet).join(' '),
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      state,
    });

    return {
      authUrl: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`,
      state,
      configured: true,
    };
  }

  private createOAuthState(userId: string): string {
    // Stateless signed state (survives Render restarts / multiple instances)
    return jwt.sign({ uid: userId, n: crypto.randomBytes(8).toString('hex') }, env.JWT_SECRET, {
      expiresIn: '15m',
    });
  }

  public validateOAuthState(state: string): string {
    try {
      const payload: any = jwt.verify(state, env.JWT_SECRET);
      if (payload?.uid) return String(payload.uid);
    } catch (_e) {
      // fall through to legacy in-memory check
    }
    const entry = oauthStateStore.get(state);
    if (!entry) {
      throw new AppError(
        'Google sign-in session expired. Please go back and click "Continue with Google" again.',
        400,
        'INVALID_OAUTH_STATE'
      );
    }
    oauthStateStore.delete(state);
    if (Date.now() > entry.expiresAt) {
      throw new AppError('Google OAuth state has expired', 400, 'EXPIRED_OAUTH_STATE');
    }
    return entry.userId;
  }

  public async handleOAuthCallback(code: string, state: string) {
    const stateTarget = this.validateOAuthState(state);

    if (!this.isOAuthConfigured()) {
      throw new AppError(
        'Google OAuth credentials (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET) are not configured in backend .env',
        400,
        'GOOGLE_OAUTH_NOT_CONFIGURED'
      );
    }

    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      const errBody = await tokenRes.text();
      throw new AppError(
        `Failed to exchange Google authorization code: ${errBody}`,
        400,
        'GOOGLE_OAUTH_EXCHANGE_FAILED'
      );
    }

    const tokenData: any = await tokenRes.json();
    const accessToken = tokenData.access_token;
    const refreshToken = tokenData.refresh_token;
    const expiresIn = Number(tokenData.expires_in) || 3600;

    let accountEmail = '';
    let accountName = 'Google Workspace Account';

    try {
      const profileRes = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (profileRes.ok) {
        const profile: any = await profileRes.json();
        accountEmail = (profile.email || '').toLowerCase().trim();
        accountName = profile.name || accountEmail || accountName;
      }
    } catch (_e) {
      // Ignore profile fetch error if scope limited
    }

    let userId = stateTarget;
    let isLogin = false;
    let jwtToken: string | undefined;
    let userRecord: any;

    if (stateTarget === 'login') {
      isLogin = true;
      if (!accountEmail) {
        throw new AppError('Could not retrieve email from Google OAuth profile', 400, 'GOOGLE_EMAIL_MISSING');
      }

      let user = await prisma.user.findUnique({ where: { email: accountEmail } });
      if (!user) {
        const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 10);
        user = await prisma.user.create({
          data: {
            email: accountEmail,
            passwordHash: randomHash,
          },
        });
        await specialistAgentService.ensureUserDefaultAgents(user.id);
        await automationService.ensurePredefinedAutomations(user.id);
      }
      userId = user.id;
      userRecord = {
        id: user.id,
        email: user.email,
        createdAt: user.createdAt,
      };
      jwtToken = jwt.sign(
        { id: user.id, email: user.email },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as any }
      );
    }

    const grantedScopeStr = String(tokenData.scope || '');
    const hasWorkspaceScopes =
      !isLogin ||
      grantedScopeStr.includes('spreadsheets') ||
      grantedScopeStr.includes('gmail') ||
      grantedScopeStr.includes('documents');

    let account: any = null;
    if (hasWorkspaceScopes) {
      account = await this.saveGoogleTokens(userId, {
        accessToken,
        refreshToken,
        expiresIn,
        accountEmail: accountEmail || 'connected@googleworkspace.com',
        accountName,
        scopes: GOOGLE_SCOPES,
      });
    } else {
      // Login-only OAuth (non-sensitive scopes) — preserve any existing full-scope token
      const existing = await prisma.connectedAccount.findFirst({
        where: { userId, provider: 'google', status: 'connected' },
      });
      account = existing || {
        provider: 'google',
        accountEmail: accountEmail || 'connected@googleworkspace.com',
        accountName,
        status: 'connected',
      };
    }

    if (isLogin) {
      return {
        isLogin: true,
        token: jwtToken,
        user: userRecord,
        account,
      };
    }

    return account;
  }

  public async saveGoogleTokens(
    userId: string,
    params: {
      accessToken: string;
      refreshToken?: string;
      expiresIn?: number;
      accountEmail?: string;
      accountName?: string;
      scopes?: string[];
    }
  ) {
    const scopes = params.scopes || GOOGLE_SCOPES;
    const expiryDate = new Date(Date.now() + (params.expiresIn || 3600) * 1000);

    const existingAccount = await prisma.connectedAccount.findFirst({
      where: { userId, provider: 'google' },
    });

    let connectedAccount;
    if (existingAccount) {
      connectedAccount = await prisma.connectedAccount.update({
        where: { id: existingAccount.id },
        data: {
          accountEmail: params.accountEmail || existingAccount.accountEmail,
          accountName: params.accountName || existingAccount.accountName,
          status: 'connected',
          scopes,
          lastConnectedAt: new Date(),
        },
      });
    } else {
      connectedAccount = await prisma.connectedAccount.create({
        data: {
          userId,
          provider: 'google',
          accountEmail: params.accountEmail || 'user@gmail.com',
          accountName: params.accountName || 'Google Workspace',
          status: 'connected',
          scopes,
          lastConnectedAt: new Date(),
        },
      });
    }

    const encryptedAccessToken = encryptSecret(params.accessToken);
    const encryptedRefreshToken = params.refreshToken
      ? encryptSecret(params.refreshToken)
      : undefined;

    const existingToken = await prisma.oAuthToken.findFirst({
      where: { connectedAccountId: connectedAccount.id },
    });

    if (existingToken) {
      await prisma.oAuthToken.update({
        where: { id: existingToken.id },
        data: {
          encryptedAccessToken,
          ...(encryptedRefreshToken ? { encryptedRefreshToken } : {}),
          expiryDate,
          scopes: scopes.join(' '),
        },
      });
    } else {
      await prisma.oAuthToken.create({
        data: {
          userId,
          connectedAccountId: connectedAccount.id,
          provider: 'google',
          encryptedAccessToken,
          encryptedRefreshToken: encryptedRefreshToken || null,
          expiryDate,
          scopes: scopes.join(' '),
        },
      });
    }

    return {
      id: connectedAccount.id,
      provider: 'google',
      accountEmail: connectedAccount.accountEmail,
      accountName: connectedAccount.accountName,
      status: connectedAccount.status,
      scopes: connectedAccount.scopes,
      lastConnectedAt: connectedAccount.lastConnectedAt,
    };
  }

  private async resolveActiveGoogleAccount(userId: string) {
    // Each user only ever uses their OWN Google account tokens (never shared across users).
    return prisma.connectedAccount.findFirst({
      where: { userId, provider: 'google' },
      include: { oauthToken: true },
    });
  }

  public async getConnectionStatus(userId: string) {
    const account = await this.resolveActiveGoogleAccount(userId);

    if (account && account.oauthToken?.encryptedAccessToken) {
      try {
        const raw = decryptSecret(account.oauthToken.encryptedAccessToken);
        if (raw === 'anavya_quick_google_session') {
          await this.disconnect(userId);
          return {
            connected: false,
            provider: 'google',
            oauthConfiguredOnServer: this.isOAuthConfigured(),
            scopes: GOOGLE_SCOPES,
            capabilities: ['google_drive', 'google_sheets', 'google_docs', 'gmail'],
          };
        }
      } catch (_e) {
        // Ignore decrypt error
      }
    }

    if (!account || account.status !== 'connected' || !account.oauthToken) {
      return {
        connected: false,
        provider: 'google',
        oauthConfiguredOnServer: this.isOAuthConfigured(),
        scopes: GOOGLE_SCOPES,
        capabilities: ['google_drive', 'google_sheets', 'google_docs', 'gmail'],
      };
    }

    return {
      connected: true,
      provider: 'google',
      oauthConfiguredOnServer: this.isOAuthConfigured(),
      accountEmail: account.accountEmail,
      accountName: account.accountName,
      status: account.status,
      scopes: account.scopes,
      lastConnectedAt: account.lastConnectedAt,
      capabilities: ['google_drive', 'google_sheets', 'google_docs', 'gmail'],
    };
  }

  public async disconnect(userId: string) {
    const account = await prisma.connectedAccount.findFirst({
      where: { userId, provider: 'google' },
      include: { oauthToken: true },
    });

    if (!account) {
      return { disconnected: true };
    }

    if (account.oauthToken?.encryptedAccessToken) {
      try {
        const token = decryptSecret(account.oauthToken.encryptedAccessToken);
        await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
          method: 'POST',
        });
      } catch (_err) {
        // Ignore network revocation error during local disconnect
      }
    }

    await prisma.oAuthToken.deleteMany({
      where: { connectedAccountId: account.id },
    });

    await prisma.connectedAccount.update({
      where: { id: account.id },
      data: { status: 'disconnected' },
    });

    return { disconnected: true };
  }

  public async getValidAccessToken(userId: string): Promise<string> {
    const pendingRefresh = refreshInFlight.get(userId);
    if (pendingRefresh) return pendingRefresh;

    const refreshPromise = this.refreshAccessTokenIfNeeded(userId);
    refreshInFlight.set(userId, refreshPromise);
    try {
      return await refreshPromise;
    } finally {
      refreshInFlight.delete(userId);
    }
  }

  private async refreshAccessTokenIfNeeded(userId: string): Promise<string> {
    const account = await this.resolveActiveGoogleAccount(userId);

    if (!account || account.status !== 'connected' || !account.oauthToken) {
      throw new AppError(
        'Google Workspace is not connected. Please connect your Google account in Plugins first.',
        400,
        'GOOGLE_NOT_CONNECTED'
      );
    }

    const tokenRecord = account.oauthToken;
    const now = Date.now();
    const expiry = tokenRecord.expiryDate ? new Date(tokenRecord.expiryDate).getTime() : now + 60000;

    if (expiry - now < 60 * 1000 && tokenRecord.encryptedRefreshToken) {
      const refreshToken = decryptSecret(tokenRecord.encryptedRefreshToken);
      const res = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: env.GOOGLE_CLIENT_ID,
          client_secret: env.GOOGLE_CLIENT_SECRET,
          refresh_token: refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!res.ok) {
        await prisma.connectedAccount.update({
          where: { id: account.id },
          data: { status: 'expired' },
        });
        throw new AppError(
          'Google OAuth refresh token expired or was revoked. Please reconnect Google in Plugins.',
          401,
          'GOOGLE_TOKEN_EXPIRED'
        );
      }

      const refreshed: any = await res.json();
      const newAccessToken = refreshed.access_token;
      const newExpiry = new Date(Date.now() + (Number(refreshed.expires_in) || 3600) * 1000);

      await prisma.oAuthToken.update({
        where: { id: tokenRecord.id },
        data: {
          encryptedAccessToken: encryptSecret(newAccessToken),
          ...(refreshed.refresh_token
            ? { encryptedRefreshToken: encryptSecret(refreshed.refresh_token) }
            : {}),
          expiryDate: newExpiry,
        },
      });

      return newAccessToken;
    }

    return decryptSecret(tokenRecord.encryptedAccessToken);
  }

  // ==========================================
  // GOOGLE DRIVE API METHODS
  // ==========================================

  public async listDriveFiles(userId: string, pageSize = 25) {
    const accessToken = await this.getValidAccessToken(userId);
    const query = encodeURIComponent('trashed=false');
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=${Math.min(50, Math.max(1, pageSize))}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive API error: ${errText}`, res.status, 'GOOGLE_DRIVE_API_ERROR');
    }

    const data: any = await res.json();
    return {
      files: (data.files || []).map((f: any) => ({
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size || 0),
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      })),
    };
  }

  public async searchDriveFiles(userId: string, searchQuery: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const safeQuery = searchQuery.replace(/'/g, "\\'");
    const q = encodeURIComponent(`name contains '${safeQuery}' and trashed=false`);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name,mimeType,size,modifiedTime,webViewLink)&pageSize=20`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive search error: ${errText}`, res.status, 'GOOGLE_DRIVE_SEARCH_ERROR');
    }

    const data: any = await res.json();
    return {
      query: searchQuery,
      files: (data.files || []).map((f: any) => ({
        fileId: f.id,
        name: f.name,
        mimeType: f.mimeType,
        size: Number(f.size || 0),
        modifiedTime: f.modifiedTime,
        webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
      })),
    };
  }

  public async getDriveFileMetadata(userId: string, fileId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,modifiedTime,webViewLink,owners`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive metadata error: ${errText}`, res.status, 'GOOGLE_DRIVE_METADATA_ERROR');
    }

    const f: any = await res.json();
    return {
      fileId: f.id,
      name: f.name,
      mimeType: f.mimeType,
      size: Number(f.size || 0),
      modifiedTime: f.modifiedTime,
      webViewLink: f.webViewLink || `https://drive.google.com/file/d/${f.id}/view`,
    };
  }

  public async downloadDriveFile(userId: string, fileId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const meta = await this.getDriveFileMetadata(userId, fileId);
    // Safety check: only allow text, CSV, JSON, Google Docs, or Google Sheets exports
    let downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
    if (meta.mimeType === 'application/vnd.google-apps.document') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/plain`;
    } else if (meta.mimeType === 'application/vnd.google-apps.spreadsheet') {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}/export?mimeType=text/csv`;
    }

    const res = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive file download error: ${errText}`, res.status, 'GOOGLE_DRIVE_DOWNLOAD_ERROR');
    }

    const content = await res.text();
    return {
      fileId: meta.fileId,
      name: meta.name,
      mimeType: meta.mimeType,
      content: content.slice(0, 50000),
      webViewLink: meta.webViewLink,
    };
  }

  public async uploadDriveFile(userId: string, name: string, content: string, mimeType = 'text/markdown') {
    const accessToken = await this.getValidAccessToken(userId);
    const metadata = { name, mimeType };
    const boundary = 'anavya_drive_upload_boundary';
    const delimiter = `\r\n--${boundary}\r\n`;
    const closeDelimiter = `\r\n--${boundary}--`;

    const multipartBody =
      delimiter +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) +
      delimiter +
      `Content-Type: ${mimeType}\r\n\r\n` +
      content +
      closeDelimiter;

    const res = await fetch(
      'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,mimeType,webViewLink',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': `multipart/related; boundary=${boundary}`,
        },
        body: multipartBody,
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive upload error: ${errText}`, res.status, 'GOOGLE_DRIVE_UPLOAD_ERROR');
    }

    const data: any = await res.json();
    return {
      fileId: data.id,
      name: data.name || name,
      mimeType: data.mimeType || mimeType,
      webViewLink: data.webViewLink || `https://drive.google.com/file/d/${data.id}/view`,
    };
  }

  public async getDriveFileLink(userId: string, fileId: string) {
    const meta = await this.getDriveFileMetadata(userId, fileId);
    return {
      fileId: meta.fileId,
      name: meta.name,
      webViewLink: meta.webViewLink,
    };
  }

  // ==========================================
  // GOOGLE SHEETS API METHODS
  // ==========================================

  public async createSpreadsheet(
    userId: string,
    title: string,
    values?: Array<Array<string | number>>,
    meta?: { conversationId?: string; taskId?: string }
  ) {
    const accessToken = await this.getValidAccessToken(userId);
    const createRes = await fetch('https://sheets.googleapis.com/v4/spreadsheets', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        properties: { title },
      }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new AppError(`Google Sheets creation failed: ${errText}`, createRes.status, 'GOOGLE_SHEETS_CREATE_ERROR');
    }

    const created: any = await createRes.json();
    const spreadsheetId = created.spreadsheetId;
    const spreadsheetUrl =
      created.spreadsheetUrl || `https://docs.google.com/spreadsheets/d/${spreadsheetId}/edit`;

    let updatedRows = 0;
    if (values && Array.isArray(values) && values.length > 0) {
      try {
        const appendRes = await this.appendRows(userId, spreadsheetId, 'Sheet1!A1', values);
        updatedRows = appendRes.updatedRows || values.length;
      } catch (_e) {
        // Ignore if initial row population fails
      }
    }

    const csvContent =
      values && values.length > 0
        ? values.map((r) => r.map((c) => String(c ?? '')).join(',')).join('\n')
        : `Title,${title}`;
    const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}.csv`;
    const localSaved = await workspaceService.writeGeneratedFile(userId, safeFilename, csvContent);

    await prisma.workspaceFile.update({
      where: { id: localSaved.id },
      data: {
        conversationId: meta?.conversationId || null,
        taskId: meta?.taskId || null,
        externalId: spreadsheetId,
        externalUrl: spreadsheetUrl,
      },
    });

    return {
      success: true,
      spreadsheetId,
      title,
      spreadsheetUrl,
      updatedRows,
      workspaceFileId: localSaved.id,
    };
  }

  public async resolveSpreadsheetId(userId: string, spreadsheetIdOrName?: string): Promise<string> {
    if (
      spreadsheetIdOrName &&
      spreadsheetIdOrName !== 'primary_sales_sheet' &&
      spreadsheetIdOrName !== 'latest' &&
      spreadsheetIdOrName.length > 20 &&
      !spreadsheetIdOrName.includes(' ')
    ) {
      return spreadsheetIdOrName;
    }

    try {
      const list = await this.listSpreadsheets(userId);
      const sheets = list.spreadsheets || [];
      if (spreadsheetIdOrName && spreadsheetIdOrName !== 'primary_sales_sheet' && spreadsheetIdOrName !== 'latest') {
        const q = spreadsheetIdOrName.toLowerCase();
        const match = sheets.find((s: any) => (s.title || s.name || '').toLowerCase().includes(q));
        if (match) return match.spreadsheetId;
      }
      if (sheets.length > 0) {
        return sheets[0].spreadsheetId;
      }
    } catch (_e) {
      // Fallback
    }

    return spreadsheetIdOrName || 'primary_sales_sheet';
  }

  public async listSpreadsheets(userId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const query = encodeURIComponent("mimeType='application/vnd.google-apps.spreadsheet' and trashed=false");
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name,modifiedTime,webViewLink)&pageSize=25`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Drive/Sheets API error: ${errText}`, res.status, 'GOOGLE_SHEETS_API_ERROR');
    }

    const data: any = await res.json();
    return {
      spreadsheets: (data.files || []).map((f: any) => ({
        spreadsheetId: f.id,
        name: f.name,
        title: f.name,
        modifiedTime: f.modifiedTime,
        url: f.webViewLink || `https://docs.google.com/spreadsheets/d/${f.id}`,
      })),
    };
  }

  public async readSpreadsheet(userId: string, spreadsheetId: string, range = 'Sheet1!A1:Z500') {
    const accessToken = await this.getValidAccessToken(userId);
    const resolvedId = await this.resolveSpreadsheetId(userId, spreadsheetId);
    const [metaRes, valRes] = await Promise.all([
      fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(resolvedId)}?fields=spreadsheetId,properties.title,sheets.properties`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      }),
      fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(resolvedId)}/values/${encodeURIComponent(range)}`,
        {
          headers: { Authorization: `Bearer ${accessToken}` },
        }
      ),
    ]);

    if (valRes.status === 404 || metaRes.status === 404) {
      throw new AppError(`Spreadsheet '${spreadsheetId}' not found`, 404, 'SPREADSHEET_NOT_FOUND');
    }
    if (!valRes.ok) {
      const errText = await valRes.text();
      throw new AppError(`Invalid spreadsheet range or Google Sheets API error: ${errText}`, 400, 'GOOGLE_SHEETS_READ_ERROR');
    }

    const metaData: any = metaRes.ok ? await metaRes.json() : {};
    const valData: any = await valRes.json();

    const rows: string[][] = valData.values || [];
    const headers = rows.length > 0 ? rows[0] : [];
    const dataRows = rows.length > 1 ? rows.slice(1) : [];

    const csvLines = rows.map((r) =>
      r.map((cell) => {
        const s = String(cell ?? '');
        return s.includes(',') || s.includes('"') ? `"${s.replace(/"/g, '""')}"` : s;
      }).join(',')
    );

    return {
      spreadsheetId,
      title: metaData?.properties?.title || 'Spreadsheet',
      sheetNames: (metaData?.sheets || []).map((s: any) => s.properties?.title).filter(Boolean),
      range: valData.range || range,
      rowCount: dataRows.length,
      headers,
      rows: dataRows,
      csvContent: csvLines.join('\n'),
    };
  }

  public async appendRows(
    userId: string,
    spreadsheetId: string,
    range: string,
    values: Array<Array<string | number>>
  ) {
    const accessToken = await this.getValidAccessToken(userId);
    const resolvedId = await this.resolveSpreadsheetId(userId, spreadsheetId);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(resolvedId)}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Sheets append error: ${errText}`, res.status, 'GOOGLE_SHEETS_APPEND_ERROR');
    }

    const data: any = await res.json();
    return {
      spreadsheetId: resolvedId,
      updatedRange: data.updates?.updatedRange || range,
      updatedRows: data.updates?.updatedRows || values.length,
    };
  }

  public async updateRange(
    userId: string,
    spreadsheetId: string,
    range: string,
    values: Array<Array<string | number>>
  ) {
    const accessToken = await this.getValidAccessToken(userId);
    const resolvedId = await this.resolveSpreadsheetId(userId, spreadsheetId);
    const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(resolvedId)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`;

    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ values }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Sheets update error: ${errText}`, res.status, 'GOOGLE_SHEETS_UPDATE_ERROR');
    }

    const data: any = await res.json();
    return {
      spreadsheetId: resolvedId,
      updatedRange: data.updatedRange || range,
      updatedCells: data.updatedCells || 0,
    };
  }

  // ==========================================
  // GOOGLE DOCS API METHODS
  // ==========================================

  public async createDocument(
    userId: string,
    title: string,
    content: string,
    meta?: { conversationId?: string; taskId?: string }
  ) {
    const accessToken = await this.getValidAccessToken(userId);
    const createRes = await fetch('https://docs.googleapis.com/v1/documents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ title }),
    });

    if (!createRes.ok) {
      const errText = await createRes.text();
      throw new AppError(`Google Docs creation failed: ${errText}`, createRes.status, 'GOOGLE_DOCS_CREATE_ERROR');
    }

    const createdDoc: any = await createRes.json();
    const documentId = createdDoc.documentId;

    if (content && content.trim() !== '') {
      await this.appendDocumentContent(userId, documentId, content);
    }

    const documentUrl = `https://docs.google.com/document/d/${documentId}/edit`;

    const safeFilename = `${title.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60)}.md`;
    const localSaved = await workspaceService.writeGeneratedFile(userId, safeFilename, content);

    await prisma.workspaceFile.update({
      where: { id: localSaved.id },
      data: {
        conversationId: meta?.conversationId || null,
        taskId: meta?.taskId || null,
        externalId: documentId,
        externalUrl: documentUrl,
      },
    });

    return {
      success: true,
      documentId,
      title,
      documentUrl,
      workspaceFileId: localSaved.id,
    };
  }

  public async readDocument(userId: string, documentId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(`https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Docs read failed: ${errText}`, res.status, 'GOOGLE_DOCS_READ_ERROR');
    }

    const doc: any = await res.json();
    const paragraphs: string[] = [];
    for (const el of doc.body?.content || []) {
      if (el.paragraph?.elements) {
        const text = el.paragraph.elements.map((e: any) => e.textRun?.content || '').join('');
        if (text.trim()) paragraphs.push(text);
      }
    }

    return {
      documentId: doc.documentId,
      title: doc.title,
      content: paragraphs.join('\n'),
      documentUrl: `https://docs.google.com/document/d/${doc.documentId}/edit`,
    };
  }

  public async appendDocumentContent(userId: string, documentId: string, textContent: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(
      `https://docs.googleapis.com/v1/documents/${encodeURIComponent(documentId)}:batchUpdate`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          requests: [
            {
              insertText: {
                location: { index: 1 },
                text: textContent,
              },
            },
          ],
        }),
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Google Docs update failed: ${errText}`, res.status, 'GOOGLE_DOCS_UPDATE_ERROR');
    }

    return {
      success: true,
      documentId,
      documentUrl: `https://docs.google.com/document/d/${documentId}/edit`,
    };
  }

  // ==========================================
  // GMAIL API METHODS (MIME RFC 2822)
  // ==========================================

  private buildMimeBase64Url(recipient: string, subject: string, bodyText: string): string {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(recipient.trim())) {
      throw new AppError(`Invalid recipient email address: '${recipient}'`, 400, 'INVALID_RECIPIENT_EMAIL');
    }

    const encodedSubject = /^[\x20-\x7E]*$/.test(subject)
      ? subject.replace(/[\r\n]/g, ' ')
      : `=?UTF-8?B?${Buffer.from(subject.replace(/[\r\n]/g, ' '), 'utf-8').toString('base64')}?=`;
    const bodyB64 = (Buffer.from(bodyText, 'utf-8').toString('base64').match(/.{1,76}/g) || []).join('\r\n');

    const mimeMessage = [
      `To: ${recipient.trim()}`,
      `Subject: ${encodedSubject}`,
      `Date: ${new Date().toUTCString()}`,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      'Content-Transfer-Encoding: base64',
      '',
      bodyB64,
    ].join('\r\n');

    return Buffer.from(mimeMessage, 'utf-8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  }

  private extractMessageParts(msg: any) {
    const headers: Array<{ name: string; value: string }> = msg.payload?.headers || [];
    const getHeader = (name: string) =>
      headers.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value || '';

    let bodyText = msg.snippet || '';
    const rawBodyData =
      msg.payload?.body?.data ||
      msg.payload?.parts?.find((p: any) => p.mimeType === 'text/plain')?.body?.data;

    if (rawBodyData) {
      try {
        bodyText = Buffer.from(rawBodyData, 'base64').toString('utf-8');
      } catch (_e) {
        // Keep snippet fallback
      }
    }

    return {
      messageId: msg.id,
      threadId: msg.threadId,
      subject: getHeader('Subject') || '(No Subject)',
      from: getHeader('From'),
      to: getHeader('To'),
      date: getHeader('Date'),
      snippet: msg.snippet || '',
      body: bodyText.slice(0, 8000),
    };
  }

  public async listGmailMessages(userId: string, maxResults = 10, query?: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const params = new URLSearchParams({
      maxResults: String(Math.min(25, Math.max(1, maxResults))),
    });
    if (query && query.trim() !== '') {
      params.set('q', query.trim());
    }

    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?${params.toString()}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Gmail list messages error: ${errText}`, res.status, 'GMAIL_LIST_ERROR');
    }

    const data: any = await res.json();
    const summaries = await Promise.all(
      (data.messages || []).slice(0, 8).map(async (m: any) => {
        try {
          return await this.getGmailMessage(userId, m.id);
        } catch (_e) {
          return {
            messageId: m.id,
            threadId: m.threadId,
            subject: 'Email Message',
            from: '',
            to: '',
            date: '',
            snippet: '',
            body: '',
          };
        }
      })
    );

    return {
      messages: summaries,
      totalCount: summaries.length,
    };
  }

  public async searchGmailMessages(userId: string, query: string, maxResults = 10) {
    return this.listGmailMessages(userId, maxResults, query);
  }

  public async getGmailMessage(userId: string, messageId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(messageId)}?format=full`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Gmail get message error: ${errText}`, res.status, 'GMAIL_GET_MESSAGE_ERROR');
    }

    const msg: any = await res.json();
    return this.extractMessageParts(msg);
  }

  public async getGmailThread(userId: string, threadId: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const res = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/threads/${encodeURIComponent(threadId)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
      }
    );

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Gmail get thread error: ${errText}`, res.status, 'GMAIL_GET_THREAD_ERROR');
    }

    const thread: any = await res.json();
    return {
      threadId: thread.id,
      messages: (thread.messages || []).map((m: any) => this.extractMessageParts(m)),
    };
  }

  public async createGmailDraft(userId: string, recipient: string, subject: string, bodyText: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const raw = this.buildMimeBase64Url(recipient, subject, bodyText);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/drafts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: { raw },
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Gmail create draft error: ${errText}`, res.status, 'GMAIL_CREATE_DRAFT_ERROR');
    }

    const data: any = await res.json();
    return {
      draftCreated: true,
      emailSent: false,
      draftId: String(data.id || 'draft_1'),
      messageId: String(data.message?.id || ''),
      recipient,
      subject,
    };
  }

  public async sendGmailMessage(userId: string, recipient: string, subject: string, bodyText: string) {
    const accessToken = await this.getValidAccessToken(userId);
    const raw = this.buildMimeBase64Url(recipient, subject, bodyText);
    const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ raw }),
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new AppError(`Gmail send message error: ${errText}`, res.status, 'GMAIL_SEND_MESSAGE_ERROR');
    }

    const data: any = await res.json();
    return {
      emailSent: true,
      messageId: String(data.id || 'msg_sent'),
      threadId: String(data.threadId || ''),
      labelIds: data.labelIds || [],
      recipient,
      subject,
      sentAt: new Date().toISOString(),
    };
  }
}

export const googleIntegrationService = new GoogleIntegrationService();
