import React, { useEffect, useState } from 'react';
import { api } from '../api/client';
import {
  Search,
  CheckCircle2,
  ExternalLink,
  RefreshCw,
  X,
  Unlink,
  Send,
  AlertCircle,
} from 'lucide-react';
import { ApplicationIcon } from '../components/BrandIcons';

type CategoryType = 'All' | 'Productivity' | 'Communication' | 'Data & Analytics' | 'Research';

interface PluginItem {
  id: string;
  name: string;
  subtitle: string;
  description: string;
  categories: CategoryType[];
  provider: 'google' | 'telegram' | 'builtin';
}

const PLUGINS: PluginItem[] = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    subtitle: 'Search, read, and upload workspace files',
    description: 'Allows agents to search and read files in your Google Drive using Google OAuth 2.0.',
    categories: ['Productivity'],
    provider: 'google',
  },
  {
    id: 'google_docs',
    name: 'Google Docs',
    subtitle: 'Create and edit formatted documents',
    description: 'Creates real Google Docs reports and returns shareable links in chat.',
    categories: ['Productivity'],
    provider: 'google',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    subtitle: 'Read spreadsheets and append rows',
    description: 'Reads live spreadsheet tabs and appends structured rows via Google Sheets API.',
    categories: ['Productivity', 'Data & Analytics'],
    provider: 'google',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    subtitle: 'Search inbox, create drafts, and send emails',
    description: 'Reads threads, creates email drafts, and sends approved emails via Gmail API.',
    categories: ['Productivity', 'Communication'],
    provider: 'google',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    subtitle: 'Receive real mobile notifications & alerts',
    description: 'Delivers instant task summaries and approval alerts to your Telegram account via your Telegram Bot.',
    categories: ['Communication'],
    provider: 'telegram',
  },
  {
    id: 'csv_analyzer',
    name: 'CSV Data Analyzer',
    subtitle: 'Built-in statistical engine for spreadsheets',
    description: 'Computes revenue totals, category rankings, and anomalies on uploaded CSV files.',
    categories: ['Data & Analytics'],
    provider: 'builtin',
  },
  {
    id: 'web_research',
    name: 'Web Research',
    subtitle: 'Built-in multi-source web synthesis',
    description: 'Gathers market intelligence, competitor benchmarks, and factual citations.',
    categories: ['Research'],
    provider: 'builtin',
  },
  {
    id: 'markdown_report',
    name: 'Report Generator',
    subtitle: 'Built-in Markdown artifact builder',
    description: 'Produces downloadable Markdown reports in your workspace.',
    categories: ['Productivity'],
    provider: 'builtin',
  },
];

const CATEGORIES: CategoryType[] = ['All', 'Productivity', 'Communication', 'Data & Analytics', 'Research'];

export const PluginsPage: React.FC = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryType>('All');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginItem | null>(null);

  const [googleStatus, setGoogleStatus] = useState<any>(null);
  const [telegramStatus, setTelegramStatus] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const [botTokenInput, setBotTokenInput] = useState('');
  const [chatIdInput, setChatIdInput] = useState('');
  const [showManualChatId, setShowManualChatId] = useState(false);
  const [busy, setBusy] = useState(false);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadStatuses = async () => {
    setLoading(true);
    try {
      const [gRes, tRes] = await Promise.all([
        api.get('/integrations/google/status'),
        api.get('/integrations/telegram/status'),
      ]);
      setGoogleStatus(gRes.data.data);
      setTelegramStatus(tRes.data.data);
      if (tRes.data.data?.linkedChatId) {
        setChatIdInput(tRes.data.data.linkedChatId);
      }
    } catch {
      // Ignore initial status error
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatuses();
    const params = new URLSearchParams(window.location.search);
    if (params.get('google') === 'connected') {
      setFeedback({ type: 'success', text: 'Google Workspace connected via OAuth 2.0.' });
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, []);

  const isPluginConnected = (plugin: PluginItem): boolean => {
    if (plugin.provider === 'builtin') return true;
    if (plugin.provider === 'google') return Boolean(googleStatus?.connected);
    if (plugin.provider === 'telegram') {
      return Boolean(telegramStatus?.connected && telegramStatus?.linkedChatId);
    }
    return false;
  };

  const handleGoogleOAuthRedirect = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await api.get('/integrations/google/connect');
      const data = res.data.data;
      if (data?.configured && data?.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setFeedback({
          type: 'error',
          text: 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to backend/.env and restart the backend server.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Could not start Google OAuth flow.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectGoogle = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      await api.delete('/integrations/google/disconnect');
      setFeedback({ type: 'success', text: 'Google account disconnected.' });
      await loadStatuses();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to disconnect Google.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleTestGoogle = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      const res = await api.get('/tools/google-drive/files?pageSize=5');
      const count = (res.data.data?.files || []).length;
      setFeedback({
        type: 'success',
        text: `Google API verified! Found ${count} accessible file(s) in your Google Drive.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Google API test failed. Reconnect via Google OAuth.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleConnectTelegramBot = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setFeedback(null);
    setBusy(true);
    try {
      const res = await api.post('/integrations/telegram/connect', {
        botToken: botTokenInput.trim() || undefined,
        chatId: chatIdInput.trim() || undefined,
      });
      const result = res.data.data;
      setBotTokenInput('');
      await loadStatuses();

      if (result.linkedChatId) {
        setFeedback({
          type: 'success',
          text: `Connected to @${result.botUsername} and linked chat (${result.linkedChatTitle || result.linkedChatId}).`,
        });
      } else {
        setFeedback({
          type: 'success',
          text: `Bot @${result.botUsername} connected! Now click Step 2 below to open @${result.botUsername} in Telegram, tap Start, and click Verify.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to connect Telegram bot. Check your BotFather token.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyAndTestTelegram = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      // First re-run connect so backend auto-discovers chat_id from getUpdates (/start)
      const connectRes = await api.post('/integrations/telegram/connect', {
        chatId: chatIdInput.trim() || undefined,
      });
      const updated = connectRes.data.data;
      await loadStatuses();

      if (!updated?.linkedChatId) {
        setFeedback({
          type: 'error',
          text: `No message found from you yet. Please open @${updated?.botUsername || telegramStatus?.botUsername} in Telegram, tap "Start" (or send "hi"), and click Verify again.`,
        });
        setBusy(false);
        return;
      }

      const sendRes = await api.post('/tools/telegram/send-message', {
        text: '✅ Anavya Workspace connected! Your agents can now send real notifications to your Telegram.',
      });
      setFeedback({
        type: 'success',
        text: `Verified & delivered real Telegram message to ${updated.linkedChatTitle || updated.linkedChatId} (Message ID: ${sendRes.data.data?.messageId}). Check your Telegram app!`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Telegram test failed.',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleDisconnectTelegram = async () => {
    setFeedback(null);
    setBusy(true);
    try {
      await api.delete('/integrations/telegram/disconnect');
      setChatIdInput('');
      setFeedback({ type: 'success', text: 'Telegram disconnected.' });
      await loadStatuses();
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.message || 'Failed to disconnect Telegram.',
      });
    } finally {
      setBusy(false);
    }
  };

  const filteredPlugins = PLUGINS.filter((p) => {
    const matchesCategory = selectedCategory === 'All' || p.categories.includes(selectedCategory);
    const q = searchQuery.toLowerCase().trim();
    const matchesSearch =
      !q ||
      p.name.toLowerCase().includes(q) ||
      p.subtitle.toLowerCase().includes(q) ||
      p.description.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="flex-1 flex flex-col h-full bg-[#121212] text-[#ECECEC] overflow-y-auto">
      <div className="max-w-5xl w-full mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-xl font-semibold tracking-tight text-white">Plugins</h1>
            <p className="text-xs text-[#8E8E93] mt-1">
              Connect real external accounts via Google OAuth 2.0 and Telegram Bot API.
            </p>
          </div>
          <button
            onClick={loadStatuses}
            className="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#1A1A1A] hover:bg-[#242424] border border-[#262626] text-xs text-[#A0A0A5] transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>

        {/* Search + Category Pills */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0">
            {CATEGORIES.map((category) => {
              const active = selectedCategory === category;
              return (
                <button
                  key={category}
                  onClick={() => setSelectedCategory(category)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition ${
                    active
                      ? 'bg-[#ECECEC] text-[#121212]'
                      : 'bg-[#1A1A1A] text-[#8E8E93] hover:text-[#ECECEC] border border-[#242424]'
                  }`}
                >
                  {category}
                </button>
              );
            })}
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-3.5 h-3.5 text-[#6E6E73] absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search plugins..."
              className="w-full pl-8 pr-3 py-1.5 bg-[#1A1A1A] border border-[#262626] rounded-lg text-xs text-[#ECECEC] placeholder-[#6E6E73] focus:outline-none focus:border-[#3A3A3C]"
            />
          </div>
        </div>

        {/* Plugins Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {filteredPlugins.map((plugin) => {
            const connected = isPluginConnected(plugin);
            const partialTelegram =
              plugin.provider === 'telegram' && telegramStatus?.connected && !telegramStatus?.linkedChatId;

            return (
              <div
                key={plugin.id}
                onClick={() => {
                  setFeedback(null);
                  setSelectedPlugin(plugin);
                }}
                className="group flex items-center justify-between p-4 rounded-xl bg-[#181818] hover:bg-[#1E1E1E] border border-[#242424] cursor-pointer transition"
              >
                <div className="flex items-center gap-3.5 min-w-0 pr-3">
                  <div className="w-10 h-10 rounded-xl bg-[#222222] border border-[#2C2C2E] flex items-center justify-center flex-shrink-0">
                    <ApplicationIcon appOrTool={plugin.id} className="w-5 h-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-medium text-[#ECECEC] truncate">{plugin.name}</h3>
                      {connected && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                          {plugin.provider === 'builtin' ? 'Built-in' : 'Connected'}
                        </span>
                      )}
                      {partialTelegram && (
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          Verify Chat
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#8E8E93] truncate mt-0.5">{plugin.subtitle}</p>
                  </div>
                </div>

                <button
                  type="button"
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium flex-shrink-0 transition ${
                    connected
                      ? 'bg-[#222222] text-[#A0A0A5] group-hover:text-white border border-[#2C2C2E]'
                      : 'bg-[#ECECEC] text-[#121212] hover:bg-white'
                  }`}
                >
                  {plugin.provider === 'builtin' ? 'Active' : connected ? 'Manage' : 'Connect'}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Minimal, Uncluttered Plugin Modal */}
      {selectedPlugin && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setSelectedPlugin(null)}
        >
          <div
            className="bg-[#181818] border border-[#2A2A2C] rounded-2xl max-w-md w-full p-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between gap-3 pb-4 border-b border-[#242424]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[#222222] border border-[#2C2C2E] flex items-center justify-center flex-shrink-0">
                  <ApplicationIcon appOrTool={selectedPlugin.id} className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-semibold text-white">{selectedPlugin.name}</h2>
                    {isPluginConnected(selectedPlugin) && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#8E8E93] mt-0.5">{selectedPlugin.subtitle}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPlugin(null)}
                className="p-1.5 rounded-lg text-[#8E8E93] hover:text-white hover:bg-[#242424]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="pt-4 space-y-4">
              <p className="text-xs text-[#A0A0A5] leading-relaxed">{selectedPlugin.description}</p>

              {feedback && (
                <div
                  className={`p-3 rounded-xl border text-xs flex items-start gap-2 ${
                    feedback.type === 'success'
                      ? 'bg-emerald-500/10 border-emerald-500/25 text-emerald-300'
                      : 'bg-red-500/10 border-red-500/25 text-red-300'
                  }`}
                >
                  {feedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  )}
                  <span>{feedback.text}</span>
                </div>
              )}

              {/* GOOGLE PLUGINS */}
              {selectedPlugin.provider === 'google' && (
                <div className="space-y-3">
                  {googleStatus?.connected ? (
                    <div className="p-3.5 rounded-xl bg-[#121212] border border-[#262626] space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] text-[#8E8E93]">Connected Google Account</div>
                          <div className="text-xs font-medium text-white mt-0.5">
                            {googleStatus.accountEmail}
                          </div>
                        </div>
                        <button
                          onClick={handleDisconnectGoogle}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition"
                        >
                          <Unlink className="w-3 h-3" />
                          Disconnect
                        </button>
                      </div>
                      <button
                        onClick={handleTestGoogle}
                        disabled={busy}
                        className="w-full py-2 rounded-lg bg-[#222222] hover:bg-[#2A2A2C] text-xs font-medium text-[#ECECEC] transition"
                      >
                        {busy ? 'Testing...' : 'Verify Google API Access'}
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <button
                        onClick={handleGoogleOAuthRedirect}
                        disabled={busy}
                        className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-xl bg-white hover:bg-neutral-200 text-[#121212] font-medium text-xs transition disabled:opacity-50"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        {busy ? 'Redirecting to Google...' : 'Sign in with Google (OAuth 2.0)'}
                      </button>

                      {!googleStatus?.oauthConfiguredOnServer && (
                        <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-200/90 space-y-1">
                          <div className="font-medium text-amber-300">Setup Required in backend/.env</div>
                          <p className="text-[#A0A0A5]">
                            Add <code className="text-amber-200">GOOGLE_CLIENT_ID</code> and{' '}
                            <code className="text-amber-200">GOOGLE_CLIENT_SECRET</code> from Google Cloud Console to{' '}
                            <code className="text-amber-200">backend/.env</code>.
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* TELEGRAM PLUGIN */}
              {selectedPlugin.provider === 'telegram' && (
                <div className="space-y-3">
                  {/* Step 1: Connect Bot */}
                  {!telegramStatus?.connected ? (
                    <form onSubmit={handleConnectTelegramBot} className="space-y-3">
                      {telegramStatus?.serverBotConfigured ? (
                        <button
                          type="submit"
                          disabled={busy}
                          className="w-full py-2.5 px-4 rounded-xl bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium text-xs transition"
                        >
                          {busy ? 'Connecting Bot...' : 'Connect Telegram Bot (from .env)'}
                        </button>
                      ) : (
                        <div className="space-y-2">
                          <label className="block text-[11px] font-medium text-[#A0A0A5]">
                            Step 1: Paste Telegram Bot Token (from @BotFather) or set TELEGRAM_BOT_TOKEN in backend/.env
                          </label>
                          <div className="flex gap-2">
                            <input
                              type="password"
                              value={botTokenInput}
                              onChange={(e) => setBotTokenInput(e.target.value)}
                              placeholder="123456789:ABCdefGHIjklMNOpqrSTUvwxYZ"
                              className="flex-1 px-3 py-2 bg-[#121212] border border-[#2A2A2C] rounded-lg text-xs text-white focus:outline-none focus:border-[#2AABEE]"
                            />
                            <button
                              type="submit"
                              disabled={busy || !botTokenInput.trim()}
                              className="px-3.5 py-2 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-white font-medium text-xs transition disabled:opacity-50"
                            >
                              {busy ? '...' : 'Connect'}
                            </button>
                          </div>
                        </div>
                      )}
                    </form>
                  ) : (
                    /* Step 2: Verify User Chat & Test */
                    <div className="p-3.5 rounded-xl bg-[#121212] border border-[#262626] space-y-3">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="text-[11px] text-[#8E8E93]">Connected Bot</div>
                          <div className="text-xs font-medium text-white mt-0.5">
                            @{telegramStatus.botUsername}
                            {telegramStatus.linkedChatId && (
                              <span className="text-emerald-400 ml-1.5">
                                • Linked ({telegramStatus.linkedChatTitle || telegramStatus.linkedChatId})
                              </span>
                            )}
                          </div>
                        </div>
                        <button
                          onClick={handleDisconnectTelegram}
                          disabled={busy}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-red-500/10 hover:bg-red-500/20 text-red-300 text-xs transition"
                        >
                          <Unlink className="w-3 h-3" />
                          Disconnect
                        </button>
                      </div>

                      <div className="pt-2 border-t border-[#222222] space-y-2">
                        <div className="text-[11px] text-[#A0A0A5]">
                          Telegram bots can only message you after you tap <b>Start</b> in the bot chat:
                        </div>

                        <div className="grid grid-cols-1 gap-2">
                          <a
                            href={`https://t.me/${telegramStatus.botUsername}?start=connect`}
                            target="_blank"
                            rel="noreferrer"
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#222222] hover:bg-[#2A2A2C] text-xs font-medium text-white transition"
                          >
                            <ExternalLink className="w-3.5 h-3.5 text-[#2AABEE]" />
                            1. Open @{telegramStatus.botUsername} in Telegram & Tap Start
                          </a>

                          <button
                            type="button"
                            onClick={handleVerifyAndTestTelegram}
                            disabled={busy}
                            className="w-full flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-[#2AABEE] hover:bg-[#229ED9] text-xs font-medium text-white transition disabled:opacity-50"
                          >
                            <Send className="w-3.5 h-3.5" />
                            {busy ? 'Verifying & Sending...' : '2. Verify & Send Real Test Message'}
                          </button>
                        </div>

                        <div className="pt-1">
                          <button
                            type="button"
                            onClick={() => setShowManualChatId(!showManualChatId)}
                            className="text-[11px] text-[#6E6E73] hover:text-[#A0A0A5]"
                          >
                            {showManualChatId ? 'Hide manual Chat ID' : 'Or enter numeric Chat ID manually'}
                          </button>
                          {showManualChatId && (
                            <div className="flex gap-2 mt-1.5">
                              <input
                                type="text"
                                value={chatIdInput}
                                onChange={(e) => setChatIdInput(e.target.value)}
                                placeholder="Numeric Chat ID (e.g. 123456789)"
                                className="flex-1 px-2.5 py-1.5 bg-[#181818] border border-[#2A2A2C] rounded-lg text-xs text-white focus:outline-none"
                              />
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* BUILT-IN PLUGINS */}
              {selectedPlugin.provider === 'builtin' && (
                <div className="p-3 rounded-xl bg-[#121212] border border-[#262626] flex items-center gap-2 text-xs text-emerald-400">
                  <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
                  <span>Built-in core tool — active automatically in all chats.</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
