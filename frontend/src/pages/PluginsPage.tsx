import React, { useState, useEffect } from 'react';
import {
  Search,
  CheckCircle2,
  Plus,
  X,
  ExternalLink,
  ShieldCheck,
  Lock,
  Loader2,
  Send,
  RefreshCw,
  FileSpreadsheet,
  FolderSearch,
  Mail,
} from 'lucide-react';
import { useWorkspaceStore } from '../context/useWorkspaceStore';
import {
  GoogleDriveIcon,
  GoogleDocsIcon,
  GoogleSheetsIcon,
  GmailIcon,
  TelegramIcon,
} from '../components/BrandIcons';
import { api } from '../api/client';

type PluginCategory =
  | 'All'
  | 'Productivity'
  | 'Communication'
  | 'Documents'
  | 'Data and Analytics'
  | 'Development';

interface PluginMetadata {
  id: 'google_drive' | 'google_docs' | 'google_sheets' | 'gmail' | 'telegram';
  name: string;
  tagline: string;
  category: PluginCategory[];
  provider: 'google' | 'telegram';
  description: string;
  availableActions: string[];
  canAccess: string[];
  canModify: string[];
  requiresApproval: string[];
  privacyInfo: string;
}

const PLUGINS_CATALOG: PluginMetadata[] = [
  {
    id: 'google_drive',
    name: 'Google Drive',
    tagline: 'Access and manage your files',
    category: ['Productivity', 'Documents'],
    provider: 'google',
    description:
      'Connect Google Drive so Anavya agents can search your folders, inspect file metadata, read spreadsheets and documents, and upload generated reports directly to your Drive.',
    availableActions: [
      'google_drive.list_files — List files in Google Drive',
      'google_drive.search_files — Search files by keyword or MIME type',
      'google_drive.get_file_metadata — Inspect file metadata & web links',
      'google_drive.download_file — Read file contents into workspace',
      'google_drive.upload_file — Upload generated reports to Drive',
      'google_drive.get_file_link — Retrieve shareable Google Drive URL',
    ],
    canAccess: [
      'File names, MIME types, modification dates, and shareable links',
      'Spreadsheets and Markdown/text documents selected for analysis',
    ],
    canModify: [
      'Create and upload new generated report files in your Drive',
    ],
    requiresApproval: [
      'Deleting any file requires explicit human approval',
    ],
    privacyInfo:
      'OAuth 2.0 tokens are stored server-side only and never exposed to the browser. Anavya never deletes Drive files without approval.',
  },
  {
    id: 'google_docs',
    name: 'Google Docs',
    tagline: 'Create, read and edit documents',
    category: ['Documents', 'Productivity'],
    provider: 'google',
    description:
      'Allow Writer and Researcher agents to generate formatted executive reports, technical specifications, and meeting summaries directly as live Google Docs.',
    availableActions: [
      'google_docs.create_document — Create a new Google Doc with structured sections',
      'google_docs.read_document — Read text content from an existing Google Doc',
      'google_docs.append_content — Append findings to an existing Google Doc',
      'google_docs.update_content — Update document content',
    ],
    canAccess: [
      'Document titles, headings, and body text of accessible Google Docs',
    ],
    canModify: [
      'Create new Google Docs and append/update sections when instructed',
    ],
    requiresApproval: [
      'Creating new documents is permitted automatically; overwriting external shared records can be restricted per agent',
    ],
    privacyInfo:
      'Uses official Google Docs API v1 with scoped OAuth access. Generated links open directly in your Google account.',
  },
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    tagline: 'Read, analyze and update spreadsheets',
    category: ['Data and Analytics', 'Productivity'],
    provider: 'google',
    description:
      'Enable the Analyst Agent to read live spreadsheets, run deterministic revenue and product rankings, and append or update cells with human approval.',
    availableActions: [
      'google_sheets.list_spreadsheets — List accessible spreadsheets',
      'google_sheets.read — Read cell ranges & run deterministic CSV/table analysis',
      'google_sheets.append_rows — Append new rows to a sheet',
      'google_sheets.update_range — Update specific cell ranges',
    ],
    canAccess: [
      'Spreadsheet titles, sheet tab names, and cell values in requested ranges',
    ],
    canModify: [
      'Append rows or update cell ranges only after human approval',
    ],
    requiresApproval: [
      'google_sheets.append_rows (Modifying existing spreadsheets)',
      'google_sheets.update_range (Updating cell ranges)',
    ],
    privacyInfo:
      'All numerical calculations (totals, averages, top-N rankings) are computed deterministically before Gemini summarizes insights.',
  },
  {
    id: 'gmail',
    name: 'Gmail',
    tagline: 'Read, draft and send emails',
    category: ['Communication', 'Productivity'],
    provider: 'google',
    description:
      'Let Anavya search relevant email threads, summarize inbox conversations, create email drafts automatically, and send emails after your explicit approval.',
    availableActions: [
      'gmail.list_messages — List recent inbox messages',
      'gmail.search_messages — Search emails by query (from:, subject:, etc.)',
      'gmail.get_message — Read full email subject, sender, and body',
      'gmail.get_thread — Read complete email thread context',
      'gmail.create_draft — Save an email draft in Gmail without sending',
      'gmail.send_message — Send an email via Gmail (Requires Approval)',
    ],
    canAccess: [
      'Email metadata (sender, recipient, subject, snippet) and message bodies for search queries',
    ],
    canModify: [
      'Create drafts in your Gmail Drafts folder',
      'Send emails only after you click "Approve and Send" in chat',
    ],
    requiresApproval: [
      'gmail.send_message — Sending any external email always pauses for human approval and allows editing the draft first',
    ],
    privacyInfo:
      'Separates safe draft creation (gmail.create_draft) from external email transmission (gmail.send_message).',
  },
  {
    id: 'telegram',
    name: 'Telegram',
    tagline: 'Send notifications and approval requests',
    category: ['Communication', 'Development'],
    provider: 'telegram',
    description:
      'Connect your Telegram Bot and link your chat to receive instant mobile notifications, executive report links, and approval alerts from Anavya agents.',
    availableActions: [
      'telegram.send_message — Deliver report summaries and links to your linked Telegram chat',
    ],
    canAccess: [
      'Bot username, linked chat ID, and webhook verification status',
    ],
    canModify: [
      'Send messages to your linked Telegram chat after human approval',
    ],
    requiresApproval: [
      'telegram.send_message — Requires human approval in chat before sending notifications during autonomous workflows',
    ],
    privacyInfo:
      'Your Telegram Bot token is validated against api.telegram.org and stored strictly on the backend.',
  },
];

const CATEGORIES: PluginCategory[] = [
  'All',
  'Productivity',
  'Communication',
  'Documents',
  'Data and Analytics',
  'Development',
];

export const PluginsPage: React.FC = () => {
  const { integrations, fetchIntegrations } = useWorkspaceStore();

  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<PluginCategory>('All');
  const [selectedPlugin, setSelectedPlugin] = useState<PluginMetadata | null>(null);

  // Interactive states inside modal
  const [loadingAction, setLoadingAction] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Telegram setup state
  const [botToken, setBotToken] = useState('');
  const [chatId, setChatId] = useState('');
  const [testText, setTestText] = useState(
    'Hello from Anavya! Your autonomous workspace is connected.'
  );

  // Live tool preview data inside modal
  const [driveFiles, setDriveFiles] = useState<any[]>([]);
  const [spreadsheets, setSpreadsheets] = useState<any[]>([]);
  const [gmailMessages, setGmailMessages] = useState<any[]>([]);
  const [draftRecipient, setDraftRecipient] = useState('client@example.com');
  const [draftSubject, setDraftSubject] = useState('Anavya Q1 Executive Summary');
  const [draftBody, setDraftBody] = useState(
    'Hi team,\n\nAttached is the latest sales analysis generated by Anavya.\n\nBest,\nAnavya Workspace'
  );

  useEffect(() => {
    fetchIntegrations();
  }, [fetchIntegrations]);

  useEffect(() => {
    if (integrations.telegram.linkedChatId) {
      setChatId(integrations.telegram.linkedChatId);
    }
  }, [integrations.telegram.linkedChatId]);

  const isPluginConnected = (plugin: PluginMetadata): boolean => {
    if (plugin.provider === 'google') {
      return Boolean(integrations.google.connected);
    }
    return Boolean(integrations.telegram.connected);
  };

  const renderPluginIcon = (id: PluginMetadata['id'], className = 'w-6 h-6') => {
    switch (id) {
      case 'google_drive':
        return <GoogleDriveIcon className={className} />;
      case 'google_docs':
        return <GoogleDocsIcon className={className} />;
      case 'google_sheets':
        return <GoogleSheetsIcon className={className} />;
      case 'gmail':
        return <GmailIcon className={className} />;
      case 'telegram':
        return <TelegramIcon className={className} />;
    }
  };

  const filteredPlugins = PLUGINS_CATALOG.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      p.tagline.toLowerCase().includes(search.toLowerCase()) ||
      p.description.toLowerCase().includes(search.toLowerCase());
    const matchesCategory =
      selectedCategory === 'All' || p.category.includes(selectedCategory);
    return matchesSearch && matchesCategory;
  });

  const installedPlugins = filteredPlugins.filter((p) => isPluginConnected(p));
  const availablePlugins = filteredPlugins.filter((p) => !isPluginConnected(p));

  const handleGoogleConnect = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.get('/integrations/google/connect');
      const data = res.data.data;
      if (data.authUrl) {
        window.location.href = data.authUrl;
      } else {
        setFeedback({
          type: 'error',
          text:
            data.setupInstructions ||
            'Configure GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in backend/.env to enable live Google OAuth redirect. Workspace fallback mode is active for local testing.',
        });
      }
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to initiate Google OAuth',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleGoogleDisconnect = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      await api.delete('/integrations/google/disconnect');
      await fetchIntegrations();
      setFeedback({ type: 'success', text: 'Google Workspace account disconnected.' });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to disconnect Google account',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTelegramConnect = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.post('/integrations/telegram/connect', {
        botToken: botToken.trim() || undefined,
        chatId: chatId.trim() || undefined,
      });
      await fetchIntegrations();
      setBotToken('');
      setFeedback({
        type: 'success',
        text: `Connected Telegram Bot @${res.data.data.botUsername}`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Telegram Bot connection failed',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTelegramDisconnect = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      await api.delete('/integrations/telegram/disconnect');
      await fetchIntegrations();
      setFeedback({ type: 'success', text: 'Telegram Bot disconnected.' });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to disconnect Telegram',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTelegramSendTest = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.post('/tools/telegram/send-message', {
        text: testText,
        chatId: chatId.trim() || undefined,
      });
      setFeedback({
        type: 'success',
        text: `Telegram message delivered (Message ID: ${res.data.data.messageId}).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to send Telegram test message',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTestDriveList = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.get('/tools/google-drive/files');
      setDriveFiles(res.data.data.files || []);
      setFeedback({
        type: 'success',
        text: `Loaded ${(res.data.data.files || []).length} file(s) from Google Drive (${res.data.data.mode}).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to list Drive files',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTestSheetsList = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.get('/integrations/google/spreadsheets');
      setSpreadsheets(res.data.data.spreadsheets || []);
      setFeedback({
        type: 'success',
        text: `Found ${(res.data.data.spreadsheets || []).length} accessible spreadsheet(s).`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to list spreadsheets',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleTestGmailList = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.get('/tools/gmail/messages');
      setGmailMessages(res.data.data.messages || []);
      setFeedback({
        type: 'success',
        text: `Loaded ${(res.data.data.messages || []).length} message(s) from Gmail.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to list Gmail messages',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const handleCreateGmailDraft = async () => {
    setLoadingAction(true);
    setFeedback(null);
    try {
      const res = await api.post('/tools/gmail/drafts', {
        recipient: draftRecipient,
        subject: draftSubject,
        body: draftBody,
      });
      setFeedback({
        type: 'success',
        text: `Created Gmail Draft (ID: ${res.data.data.draftId}) to ${draftRecipient}.`,
      });
    } catch (err: any) {
      setFeedback({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to create Gmail draft',
      });
    } finally {
      setLoadingAction(false);
    }
  };

  const renderPluginCard = (plugin: PluginMetadata) => {
    const connected = isPluginConnected(plugin);
    return (
      <div
        key={plugin.id}
        onClick={() => {
          setSelectedPlugin(plugin);
          setFeedback(null);
        }}
        className="group bg-[#232323] hover:bg-[#292929] border border-[#303030] hover:border-[#3E3E3E] rounded-2xl p-4 flex items-center justify-between gap-4 cursor-pointer transition shadow-sm"
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-12 h-12 rounded-2xl bg-[#1A1A1A] border border-[#2E2E2E] flex items-center justify-center shrink-0 shadow-inner">
            {renderPluginIcon(plugin.id, 'w-6 h-6')}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-semibold text-[#F5F5F5] truncate">
                {plugin.name}
              </h3>
              {connected && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-[#1F352C] text-[#36C99A]">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  Connected
                </span>
              )}
            </div>
            <p className="text-xs text-[#9E9E9E] truncate mt-0.5">
              {plugin.tagline}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setSelectedPlugin(plugin);
            setFeedback(null);
          }}
          className={`shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition flex items-center gap-1 ${
            connected
              ? 'bg-[#2E2E2E] hover:bg-[#383838] text-[#D8D8D8]'
              : 'bg-[#2C2C2C] group-hover:bg-[#E9A23B] text-[#F5F5F5] group-hover:text-[#151515]'
          }`}
        >
          {connected ? (
            <span>Manage</span>
          ) : (
            <>
              <Plus className="w-3.5 h-3.5" />
              <span>Connect</span>
            </>
          )}
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#1E1E1E] px-6 md:px-10 py-8">
      <div className="max-w-5xl mx-auto space-y-7">
        {/* Top Marketplace Header (Reference Image 4 style) */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-[#2C2C2C] pb-6">
          <div>
            <h1 className="text-2xl font-semibold text-[#F5F5F5] tracking-tight">
              Plugins
            </h1>
            <p className="text-sm text-[#A0A0A0] mt-1">
              Browse plugins to connect your tools and extend what Anavya can do.
            </p>
          </div>

          {/* Search Input */}
          <div className="relative w-full md:w-72">
            <Search className="w-4 h-4 text-[#787878] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search plugins..."
              className="w-full bg-[#262626] border border-[#343434] focus:border-[#E9A23B] rounded-xl pl-9 pr-3.5 py-2 text-xs text-[#F5F5F5] placeholder-[#787878] focus:outline-none transition"
            />
          </div>
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {CATEGORIES.map((cat) => {
            const active = selectedCategory === cat;
            return (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${
                  active
                    ? 'bg-[#F5F5F5] text-[#171717]'
                    : 'bg-[#262626] text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#2E2E2E]'
                }`}
              >
                {cat}
              </button>
            );
          })}
        </div>

        {/* INSTALLED SECTION */}
        {installedPlugins.length > 0 && (
          <section className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E8E]">
                Installed ({installedPlugins.length})
              </h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {installedPlugins.map((plugin) => renderPluginCard(plugin))}
            </div>
          </section>
        )}

        {/* AVAILABLE SECTION */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[#8E8E8E]">
              Available ({availablePlugins.length})
            </h2>
          </div>
          {availablePlugins.length === 0 ? (
            <div className="bg-[#232323] border border-[#303030] rounded-2xl p-8 text-center">
              <p className="text-xs text-[#A0A0A0]">
                {installedPlugins.length === PLUGINS_CATALOG.length
                  ? 'All official Anavya plugins are installed and active!'
                  : 'No plugins match your search filter.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              {availablePlugins.map((plugin) => renderPluginCard(plugin))}
            </div>
          )}
        </section>
      </div>

      {/* PLUGIN DETAILS & PERMISSIONS MODAL */}
      {selectedPlugin && (
        <div
          className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto"
          onClick={() => setSelectedPlugin(null)}
        >
          <div
            className="bg-[#222222] border border-[#363636] rounded-2xl max-w-2xl w-full p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-start justify-between gap-4 border-b border-[#2E2E2E] pb-4">
              <div className="flex items-center gap-3.5">
                <div className="w-12 h-12 rounded-2xl bg-[#181818] border border-[#303030] flex items-center justify-center shrink-0">
                  {renderPluginIcon(selectedPlugin.id, 'w-7 h-7')}
                </div>
                <div>
                  <div className="flex items-center gap-2.5">
                    <h2 className="text-lg font-semibold text-[#F5F5F5]">
                      {selectedPlugin.name}
                    </h2>
                    {isPluginConnected(selectedPlugin) ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#1F352C] text-[#36C99A] font-medium">
                        ● Connected
                      </span>
                    ) : (
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0] font-medium">
                        Not Connected
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-[#A0A0A0] mt-0.5">
                    {selectedPlugin.tagline} • Categories: {selectedPlugin.category.join(', ')}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedPlugin(null)}
                className="p-1.5 rounded-lg text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#2E2E2E]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {feedback && (
              <div
                className={`p-3.5 rounded-xl border text-xs ${
                  feedback.type === 'success'
                    ? 'bg-[#1F352C]/60 border-[#36C99A]/40 text-[#36C99A]'
                    : 'bg-[#2A1C1C] border-[#EF6464]/40 text-[#EF6464]'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {/* Description */}
            <div>
              <h3 className="text-xs font-semibold text-[#F5F5F5] mb-1">
                About {selectedPlugin.name}
              </h3>
              <p className="text-xs text-[#C8C8C8] leading-relaxed">
                {selectedPlugin.description}
              </p>
            </div>

            {/* Connection & Account Controls */}
            {selectedPlugin.provider === 'google' ? (
              <div className="bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between flex-wrap gap-2">
                  <div>
                    <p className="text-xs font-semibold text-[#F5F5F5]">
                      Google Workspace OAuth 2.0 Connection
                    </p>
                    <p className="text-[11px] text-[#9E9E9E] mt-0.5">
                      {integrations.google.connected
                        ? `Signed in as ${integrations.google.accountEmail || 'Google User'}`
                        : 'Single Google sign-in powers Google Drive, Docs, Sheets, and Gmail.'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleGoogleConnect}
                      disabled={loadingAction}
                      className="px-3.5 py-1.5 rounded-lg bg-[#E9A23B] hover:opacity-90 text-[#151515] font-semibold text-xs transition inline-flex items-center gap-1.5"
                    >
                      {loadingAction ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <ExternalLink className="w-3.5 h-3.5" />
                      )}
                      <span>
                        {integrations.google.connected ? 'Reconnect OAuth' : 'Connect with Google'}
                      </span>
                    </button>
                    {integrations.google.connected && (
                      <button
                        onClick={handleGoogleDisconnect}
                        disabled={loadingAction}
                        className="px-3 py-1.5 rounded-lg bg-[#2A2A2A] hover:bg-[#EF6464]/20 hover:text-[#EF6464] text-xs text-[#D0D0D0] transition"
                      >
                        Disconnect
                      </button>
                    )}
                  </div>
                </div>

                {/* Interactive Live Tool Sandbox for the Selected Google Plugin */}
                {selectedPlugin.id === 'google_drive' && (
                  <div className="pt-2 border-t border-[#282828] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#A0A0A0]">
                        Test Google Drive File Discovery
                      </span>
                      <button
                        onClick={handleTestDriveList}
                        disabled={loadingAction}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#262626] hover:bg-[#323232] text-xs text-[#F5F5F5]"
                      >
                        <FolderSearch className="w-3.5 h-3.5 text-[#E9A23B]" />
                        <span>List Drive Files</span>
                      </button>
                    </div>
                    {driveFiles.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {driveFiles.map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-[#222222]"
                          >
                            <span className="text-[#E5E5E5] truncate">{f.name}</span>
                            <span className="text-[10px] text-[#8E8E8E]">{f.mimeType}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPlugin.id === 'google_sheets' && (
                  <div className="pt-2 border-t border-[#282828] space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#A0A0A0]">
                        Test Accessible Spreadsheets
                      </span>
                      <button
                        onClick={handleTestSheetsList}
                        disabled={loadingAction}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#262626] hover:bg-[#323232] text-xs text-[#F5F5F5]"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-[#36C99A]" />
                        <span>List Spreadsheets</span>
                      </button>
                    </div>
                    {spreadsheets.length > 0 && (
                      <div className="space-y-1 max-h-32 overflow-y-auto">
                        {spreadsheets.map((s, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-[#222222]"
                          >
                            <span className="text-[#E5E5E5] truncate">{s.name}</span>
                            <span className="text-[10px] font-mono text-[#8E8E8E]">{s.id}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {selectedPlugin.id === 'gmail' && (
                  <div className="pt-2 border-t border-[#282828] space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] text-[#A0A0A0]">
                        Test Gmail Inbox & Safe Draft Creation
                      </span>
                      <button
                        onClick={handleTestGmailList}
                        disabled={loadingAction}
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#262626] hover:bg-[#323232] text-xs text-[#F5F5F5]"
                      >
                        <Mail className="w-3.5 h-3.5 text-[#EA4335]" />
                        <span>Load Recent Emails</span>
                      </button>
                    </div>
                    {gmailMessages.length > 0 && (
                      <div className="space-y-1 max-h-28 overflow-y-auto">
                        {gmailMessages.map((m, i) => (
                          <div
                            key={i}
                            className="text-xs px-2.5 py-1.5 rounded bg-[#222222] flex items-center justify-between"
                          >
                            <span className="text-[#E5E5E5] truncate">{m.subject}</span>
                            <span className="text-[10px] text-[#8E8E8E] ml-2 shrink-0">
                              {m.from}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                      <input
                        type="email"
                        value={draftRecipient}
                        onChange={(e) => setDraftRecipient(e.target.value)}
                        placeholder="Recipient email"
                        className="bg-[#242424] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                      />
                      <input
                        type="text"
                        value={draftSubject}
                        onChange={(e) => setDraftSubject(e.target.value)}
                        placeholder="Subject"
                        className="bg-[#242424] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                      />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <input
                        type="text"
                        value={draftBody}
                        onChange={(e) => setDraftBody(e.target.value)}
                        className="flex-1 bg-[#242424] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                      />
                      <button
                        onClick={handleCreateGmailDraft}
                        disabled={loadingAction}
                        className="px-3 py-1.5 rounded-lg bg-[#303030] hover:bg-[#3A3A3A] text-xs text-[#E9A23B] font-medium shrink-0"
                      >
                        Create Gmail Draft
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Telegram Connection Form inside Modal */
              <form
                onSubmit={handleTelegramConnect}
                className="bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl p-4 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-semibold text-[#F5F5F5]">
                      Telegram Bot Configuration
                    </p>
                    <p className="text-[11px] text-[#9E9E9E]">
                      {integrations.telegram.connected
                        ? `Connected to @${integrations.telegram.botUsername} (Chat ID: ${
                            integrations.telegram.linkedChatId || 'Not linked'
                          })`
                        : 'Enter your @BotFather token and target Chat ID.'}
                    </p>
                  </div>
                  {integrations.telegram.connected && (
                    <button
                      type="button"
                      onClick={handleTelegramDisconnect}
                      className="px-2.5 py-1 rounded-lg bg-[#2A2A2A] hover:bg-[#EF6464]/20 hover:text-[#EF6464] text-xs text-[#D0D0D0]"
                    >
                      Disconnect
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <input
                    type="password"
                    value={botToken}
                    onChange={(e) => setBotToken(e.target.value)}
                    placeholder={
                      integrations.telegram.connected
                        ? 'Leave blank to keep existing Bot Token'
                        : 'Bot Token (123456:ABC-DEF...)'
                    }
                    className="bg-[#242424] border border-[#343434] rounded-lg px-3 py-1.5 text-xs text-[#F5F5F5]"
                  />
                  <input
                    type="text"
                    value={chatId}
                    onChange={(e) => setChatId(e.target.value)}
                    placeholder="Telegram Chat ID (e.g. 987654321)"
                    className="bg-[#242424] border border-[#343434] rounded-lg px-3 py-1.5 text-xs text-[#F5F5F5]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <button
                    type="submit"
                    disabled={loadingAction}
                    className="px-3.5 py-1.5 rounded-lg bg-[#E9A23B] text-[#151515] font-semibold text-xs hover:opacity-90 transition"
                  >
                    {integrations.telegram.connected
                      ? 'Update Telegram Settings'
                      : 'Connect Telegram Bot'}
                  </button>

                  {integrations.telegram.connected && (
                    <button
                      type="button"
                      onClick={handleTelegramSendTest}
                      disabled={loadingAction}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#262626] hover:bg-[#323232] text-xs text-[#36C99A]"
                    >
                      <Send className="w-3 h-3" />
                      <span>Send Test Notification</span>
                    </button>
                  )}
                </div>
              </form>
            )}

            {/* Available Actions */}
            <div>
              <h3 className="text-xs font-semibold text-[#F5F5F5] mb-2">
                Available Actions ({selectedPlugin.availableActions.length})
              </h3>
              <div className="grid grid-cols-1 gap-1.5">
                {selectedPlugin.availableActions.map((act, i) => (
                  <div
                    key={i}
                    className="px-3 py-2 rounded-lg bg-[#1A1A1A] border border-[#2C2C2C] text-xs text-[#D0D0D0] font-mono"
                  >
                    {act}
                  </div>
                ))}
              </div>
            </div>

            {/* Permissions Breakdown Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#36C99A] mb-1.5">
                  <ShieldCheck className="w-3.5 h-3.5" />
                  <span>What Anavya Can Access</span>
                </div>
                <ul className="space-y-1 text-[11px] text-[#B8B8B8] list-disc list-inside">
                  {selectedPlugin.canAccess.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E9A23B] mb-1.5">
                  <RefreshCw className="w-3.5 h-3.5" />
                  <span>What Anavya Can Modify</span>
                </div>
                <ul className="space-y-1 text-[11px] text-[#B8B8B8] list-disc list-inside">
                  {selectedPlugin.canModify.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>

              <div className="bg-[#1A1A1A] border border-[#2C2C2C] rounded-xl p-3.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[#F59E0B] mb-1.5">
                  <Lock className="w-3.5 h-3.5" />
                  <span>Requires Human Approval</span>
                </div>
                <ul className="space-y-1 text-[11px] text-[#B8B8B8] list-disc list-inside">
                  {selectedPlugin.requiresApproval.map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Privacy Information */}
            <div className="bg-[#181818] border border-[#2A2A2A] rounded-xl p-3.5 flex items-start gap-2.5">
              <Lock className="w-4 h-4 text-[#8E8E8E] shrink-0 mt-0.5" />
              <div>
                <p className="text-[11px] font-semibold text-[#D0D0D0]">
                  Privacy & Credential Security
                </p>
                <p className="text-[11px] text-[#8E8E8E] mt-0.5 leading-relaxed">
                  {selectedPlugin.privacyInfo}
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

