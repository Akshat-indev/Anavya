import React, { useState, useEffect } from 'react';
import {
  FileSpreadsheet,
  FileText,
  Send,
  CheckCircle2,
  XCircle,
  ExternalLink,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { useWorkspaceStore } from '../context/useWorkspaceStore';
import { api } from '../api/client';

export const ConnectedApps: React.FC = () => {
  const { integrations, fetchIntegrations } = useWorkspaceStore();

  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [loadingTelegram, setLoadingTelegram] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);
  const [spreadsheets, setSpreadsheets] = useState<any[]>([]);

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  const handleConnectGoogle = async () => {
    setLoadingGoogle(true);
    setFeedback(null);
    try {
      const res = await api.get('/integrations/google/connect');
      const data = res.data.data;
      if (data.configured && data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setFeedback({
          type: 'error',
          message:
            'Google OAuth credentials (GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET) are not set in backend/.env yet. Add them from Google Cloud Console to authorize your Google account.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          'Failed to initialize Google OAuth flow',
      });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setLoadingGoogle(true);
    setFeedback(null);
    try {
      await api.delete('/integrations/google/disconnect');
      await fetchIntegrations();
      setSpreadsheets([]);
      setFeedback({
        type: 'success',
        message: 'Google Workspace disconnected and tokens revoked.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          'Failed to disconnect Google Workspace',
      });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleLoadSpreadsheets = async () => {
    setLoadingGoogle(true);
    setFeedback(null);
    try {
      const res = await api.get('/integrations/google/spreadsheets');
      setSpreadsheets(res.data.data.spreadsheets || []);
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message || 'Failed to list spreadsheets',
      });
    } finally {
      setLoadingGoogle(false);
    }
  };

  const handleConnectTelegram = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingTelegram(true);
    setFeedback(null);
    try {
      const res = await api.post('/integrations/telegram/connect', {
        botToken: botToken.trim() || undefined,
        chatId: chatId.trim() || undefined,
      });
      setBotToken('');
      await fetchIntegrations();
      setFeedback({
        type: 'success',
        message: `Connected Telegram Bot @${res.data.data.botUsername}${
          res.data.data.linkedChatId
            ? ` and linked chat ${res.data.data.linkedChatTitle || res.data.data.linkedChatId}`
            : ''
        }.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          'Failed to connect Telegram Bot via getMe',
      });
    } finally {
      setLoadingTelegram(false);
    }
  };

  const handleLinkTelegramChat = async () => {
    if (!chatId.trim()) return;
    setLoadingTelegram(true);
    setFeedback(null);
    try {
      const res = await api.post('/integrations/telegram/link-chat', {
        chatId: chatId.trim(),
      });
      await fetchIntegrations();
      setFeedback({
        type: 'success',
        message: `Linked Telegram chat: ${res.data.data.linkedChatTitle} (${res.data.data.linkedChatId})`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message || 'Failed to link Telegram chat',
      });
    } finally {
      setLoadingTelegram(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    setLoadingTelegram(true);
    setFeedback(null);
    try {
      await api.delete('/integrations/telegram/disconnect');
      await fetchIntegrations();
      setFeedback({
        type: 'success',
        message: 'Telegram Bot disconnected and encrypted token removed.',
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        message:
          err?.response?.data?.error?.message ||
          'Failed to disconnect Telegram Bot',
      });
    } finally {
      setLoadingTelegram(false);
    }
  };

  const google = integrations.google;
  const telegram = integrations.telegram;

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#202020] p-8">
      <div className="max-w-4xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">
            Connected Applications
          </h1>
          <p className="text-xs text-[#A0A0A0] mt-1">
            Authorize external applications so your Specialist AI Agents can read spreadsheets, generate Google Docs reports, and send Telegram notifications. All tokens are AES-256-GCM encrypted at rest and never exposed to the browser.
          </p>
        </div>

        {feedback && (
          <div
            className={`p-4 rounded-xl border text-xs flex items-center justify-between ${
              feedback.type === 'success'
                ? 'bg-[#1F352C] border-[#36C99A]/40 text-[#36C99A]'
                : 'bg-[#2A1C1C] border-[#EF6464]/40 text-[#EF6464]'
            }`}
          >
            <span>{feedback.message}</span>
            <button
              onClick={() => setFeedback(null)}
              className="text-xs underline ml-4"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* 1. Google Sheets Card */}
        <div className="bg-[#262626] border border-[#333333] rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#1F352C] flex items-center justify-center text-[#36C99A]">
                <FileSpreadsheet className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">
                    Google Sheets (OAuth 2.0)
                  </h2>
                  {google.connected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#1F352C] text-[#36C99A]">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0]">
                      <XCircle className="w-3 h-3" /> Not Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A0A0A0] mt-1">
                  Allows Analyst Agent to list spreadsheets, read cell ranges, perform deterministic revenue calculations, and append/update ranges with human approval.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {google.connected ? (
                <>
                  <button
                    onClick={handleLoadSpreadsheets}
                    disabled={loadingGoogle}
                    className="px-3 py-1.5 rounded-lg bg-[#303030] hover:bg-[#3A3A3A] text-xs text-[#F5F5F5] flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    <span>List Sheets</span>
                  </button>
                  <button
                    onClick={handleDisconnectGoogle}
                    disabled={loadingGoogle}
                    className="px-3 py-1.5 rounded-lg bg-[#2A1C1C] hover:bg-[#EF6464]/20 text-xs text-[#EF6464] transition"
                  >
                    Disconnect
                  </button>
                </>
              ) : (
                <button
                  onClick={handleConnectGoogle}
                  disabled={loadingGoogle}
                  className="px-4 py-2 rounded-xl bg-[#E9A23B] hover:opacity-90 text-xs font-semibold text-[#151515] transition"
                >
                  Connect Google Workspace
                </button>
              )}
            </div>
          </div>

          <div className="pt-3 border-t border-[#323232] grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div>
              <span className="text-[#787878] block">Account</span>
              <span className="text-[#D8D8D8]">
                {google.connected
                  ? google.accountEmail || 'Authorized Google Account'
                  : 'None'}
              </span>
            </div>
            <div>
              <span className="text-[#787878] block">Available Tools</span>
              <span className="text-[#D8D8D8] font-mono text-[11px]">
                google_sheets.list_spreadsheets, .read, .append_rows, .update_range
              </span>
            </div>
            <div>
              <span className="text-[#787878] block">Last Connected</span>
              <span className="text-[#D8D8D8]">
                {google.lastConnectedAt
                  ? new Date(google.lastConnectedAt).toLocaleString()
                  : 'Never'}
              </span>
            </div>
          </div>

          {spreadsheets.length > 0 && (
            <div className="pt-3 border-t border-[#323232] space-y-2">
              <p className="text-xs font-medium text-[#A0A0A0]">
                Accessible Spreadsheets ({spreadsheets.length}):
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {spreadsheets.map((s) => (
                  <a
                    key={s.spreadsheetId}
                    href={s.url}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2.5 rounded-xl bg-[#1E1E1E] hover:bg-[#2A2A2A] border border-[#323232] flex items-center justify-between text-xs"
                  >
                    <span className="text-[#F5F5F5] truncate">{s.title}</span>
                    <ExternalLink className="w-3.5 h-3.5 text-[#E9A23B] shrink-0" />
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* 2. Google Docs Card */}
        <div className="bg-[#262626] border border-[#333333] rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#1E293B] flex items-center justify-center text-[#60A5FA]">
                <FileText className="w-6 h-6" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">
                    Google Docs (OAuth 2.0)
                  </h2>
                  {google.connected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#1F352C] text-[#36C99A]">
                      <CheckCircle2 className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0]">
                      <XCircle className="w-3 h-3" /> Shares Google OAuth
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A0A0A0] mt-1">
                  Allows Writer Agent to create formatted business reports directly in your Google Docs account and return live document links in chat.
                </p>
              </div>
            </div>

            {!google.connected && (
              <button
                onClick={handleConnectGoogle}
                disabled={loadingGoogle}
                className="px-4 py-2 rounded-xl bg-[#303030] hover:bg-[#3A3A3A] text-xs font-medium text-[#F5F5F5] transition shrink-0"
              >
                Connect via Google OAuth
              </button>
            )}
          </div>

          <div className="pt-3 border-t border-[#323232] grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div>
              <span className="text-[#787878] block">Available Tools</span>
              <span className="text-[#D8D8D8] font-mono text-[11px]">
                google_docs.create_document, .read_document, .append_content, .update_content
              </span>
            </div>
            <div>
              <span className="text-[#787878] block">Minimum OAuth Scopes</span>
              <span className="text-[#D8D8D8] font-mono text-[11px]">
                https://www.googleapis.com/auth/documents, /auth/spreadsheets
              </span>
            </div>
          </div>
        </div>

        {/* 3. Telegram Bot Integration Card */}
        <div className="bg-[#262626] border border-[#333333] rounded-2xl p-6 space-y-4">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-[#1A2E3B] flex items-center justify-center text-[#38BDF8]">
                <Send className="w-5 h-5" />
              </div>
              <div>
                <div className="flex items-center gap-2.5">
                  <h2 className="text-sm font-semibold text-[#F5F5F5]">
                    Telegram Bot API (@BotFather)
                  </h2>
                  {telegram.connected ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#1F352C] text-[#36C99A]">
                      <CheckCircle2 className="w-3 h-3" /> Connected (@
                      {telegram.botUsername})
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0]">
                      <XCircle className="w-3 h-3" /> Not Connected
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#A0A0A0] mt-1">
                  Validates your Telegram bot via <code className="text-[#E9A23B]">getMe</code>, links your permitted Chat ID via <code className="text-[#E9A23B]">getChat</code>, and sends human-approved task completion notifications and report links.
                </p>
              </div>
            </div>

            {telegram.connected && (
              <button
                onClick={handleDisconnectTelegram}
                disabled={loadingTelegram}
                className="px-3 py-1.5 rounded-lg bg-[#2A1C1C] hover:bg-[#EF6464]/20 text-xs text-[#EF6464] transition shrink-0"
              >
                Disconnect Bot
              </button>
            )}
          </div>

          <form
            onSubmit={handleConnectTelegram}
            className="pt-3 border-t border-[#323232] grid grid-cols-1 md:grid-cols-3 gap-3 items-end"
          >
            <div>
              <label className="text-[11px] text-[#A0A0A0] block mb-1">
                BotFather Token (Encrypted at rest)
              </label>
              <input
                type="password"
                value={botToken}
                onChange={(e) => setBotToken(e.target.value)}
                placeholder={
                  telegram.connected
                    ? '•••••••••••••••••••• (Connected)'
                    : '123456789:ABCdefGHIjklMNOpqr...'
                }
                className="w-full bg-[#1C1C1C] border border-[#343434] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
              />
            </div>

            <div>
              <label className="text-[11px] text-[#A0A0A0] block mb-1">
                Permitted Telegram Chat ID
              </label>
              <input
                type="text"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                placeholder={
                  telegram.linkedChatId
                    ? `${telegram.linkedChatId} (${telegram.linkedChatTitle || 'Linked'})`
                    : 'e.g. 987654321 or -100123456789'
                }
                className="w-full bg-[#1C1C1C] border border-[#343434] rounded-xl px-3 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
              />
            </div>

            <div className="flex items-center gap-2">
              <button
                type="submit"
                disabled={loadingTelegram}
                className="flex-1 py-2 px-3 rounded-xl bg-[#E9A23B] hover:opacity-90 text-xs font-semibold text-[#151515] transition disabled:opacity-50"
              >
                {telegram.connected ? 'Update Bot / Chat' : 'Validate & Connect'}
              </button>
              {telegram.connected && chatId.trim() && (
                <button
                  type="button"
                  onClick={handleLinkTelegramChat}
                  disabled={loadingTelegram}
                  className="py-2 px-3 rounded-xl bg-[#303030] hover:bg-[#3A3A3A] text-xs text-[#F5F5F5] transition"
                >
                  Link Chat Only
                </button>
              )}
            </div>
          </form>

          <div className="pt-2 flex items-center gap-2 text-[11px] text-[#787878]">
            <ShieldCheck className="w-3.5 h-3.5 text-[#36C99A]" />
            <span>
              Security: Bot tokens are never returned to the frontend. Every Telegram message requires explicit Human-in-the-Loop approval inside chat.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

