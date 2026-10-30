import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Palette,
  Cpu,
  Link2,
  ShieldCheck,
  Database,
  Sliders,
  Trash2,
  Edit3,
  Plus,
  Check,
  X,
  LogOut,
  CheckCircle2,
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

export const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { user, integrations, fetchIntegrations, logout } = useWorkspaceStore();

  // Appearance state
  const [themeMode, setThemeMode] = useState<'dark' | 'light' | 'system'>(
    (localStorage.getItem('anavya_theme') as any) || 'dark'
  );

  // AI Health & Configuration
  const [health, setHealth] = useState<any>(null);

  // Security Policy Toggles
  const [securityPrefs, setSecurityPrefs] = useState({
    approveEmails: true,
    approveTelegram: true,
    approveSheetsModify: true,
  });

  // Workspace Preferences
  const [workspacePrefs, setWorkspacePrefs] = useState({
    defaultAgent: localStorage.getItem('anavya_default_agent') || 'coordinator',
    defaultOutputStyle: localStorage.getItem('anavya_output_style') || 'executive_report',
    desktopNotifications: true,
  });

  // Persistent Memory state
  const [memories, setMemories] = useState<any[]>([]);
  const [newMemoryCat, setNewMemoryCat] = useState('user_preference');
  const [newMemoryContent, setNewMemoryContent] = useState('');
  const [editingMemoryId, setEditingMemoryId] = useState<string | null>(null);
  const [editingMemoryText, setEditingMemoryText] = useState('');
  const [banner, setBanner] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const [hRes, mRes] = await Promise.all([
        api.get('/health'),
        api.get('/memory'),
      ]);
      setHealth(hRes.data.data);
      setMemories(mRes.data.data.memories || []);
    } catch (_e) {
      // Ignore
    }
  };

  useEffect(() => {
    fetchIntegrations();
    loadData();
  }, []);

  const handleThemeChange = (mode: 'dark' | 'light' | 'system') => {
    setThemeMode(mode);
    localStorage.setItem('anavya_theme', mode);
    if (mode === 'light') {
      document.documentElement.classList.remove('dark');
    } else {
      document.documentElement.classList.add('dark');
    }
    setBanner(`Appearance updated to ${mode} mode.`);
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMemoryContent.trim()) return;
    await api.post('/memory', {
      category: newMemoryCat,
      content: newMemoryContent.trim(),
    });
    setNewMemoryContent('');
    await loadData();
    setBanner('Memory saved to Anavya persistent context.');
  };

  const handleUpdateMemory = async (id: string) => {
    if (!editingMemoryText.trim()) return;
    await api.patch(`/memory/${id}`, { content: editingMemoryText.trim() });
    setEditingMemoryId(null);
    await loadData();
    setBanner('Memory entry updated.');
  };

  const handleDeleteMemory = async (id: string) => {
    await api.delete(`/memory/${id}`);
    await loadData();
  };

  const handleClearAllMemories = async () => {
    for (const m of memories) {
      await api.delete(`/memory/${m.id}`);
    }
    await loadData();
    setBanner('Cleared all workspace memories.');
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#1E1E1E] px-6 md:px-10 py-8">
      <div className="max-w-4xl mx-auto space-y-6 pb-16">
        {/* Page Header */}
        <div className="flex items-center justify-between border-b border-[#2C2C2C] pb-5">
          <div>
            <h1 className="text-2xl font-semibold text-[#F5F5F5] tracking-tight">
              Settings
            </h1>
            <p className="text-sm text-[#A0A0A0] mt-1">
              Manage your Anavya profile, appearance, AI runtime, connected accounts, security, and persistent memory.
            </p>
          </div>

          <button
            onClick={logout}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-[#2A1C1C] hover:bg-[#EF6464]/20 border border-[#EF6464]/30 text-xs text-[#EF6464] font-semibold transition"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Sign Out</span>
          </button>
        </div>

        {banner && (
          <div className="p-3.5 rounded-xl bg-[#1F352C]/60 border border-[#36C99A]/40 text-xs text-[#36C99A] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{banner}</span>
            </div>
            <button onClick={() => setBanner(null)}>
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* 1. PROFILE */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
            <User className="w-4 h-4" />
            <span>1. Profile</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5">
              <span className="text-[11px] text-[#8E8E8E] block">Authenticated Email</span>
              <span className="text-sm font-medium text-[#F5F5F5]">
                {user?.email || 'user@anavya.ai'}
              </span>
            </div>
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5">
              <span className="text-[11px] text-[#8E8E8E] block">Workspace User ID</span>
              <span className="text-xs font-mono text-[#D0D0D0]">
                {user?.id || 'active_session'}
              </span>
            </div>
          </div>
        </section>

        {/* 2. APPEARANCE */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
            <Palette className="w-4 h-4" />
            <span>2. Appearance</span>
          </div>
          <p className="text-xs text-[#A0A0A0]">
            Choose your preferred Anavya interface theme.
          </p>
          <div className="grid grid-cols-3 gap-3 pt-1">
            {[
              { id: 'dark', label: 'Dark Mode (Default)' },
              { id: 'light', label: 'Light Mode' },
              { id: 'system', label: 'System Default' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleThemeChange(opt.id as any)}
                className={`p-3 rounded-xl border text-xs font-medium transition ${
                  themeMode === opt.id
                    ? 'bg-[#E9A23B]/15 border-[#E9A23B] text-[#E9A23B]'
                    : 'bg-[#1B1B1B] border-[#2E2E2E] text-[#C8C8C8] hover:bg-[#222222]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </section>

        {/* 3. AI CONFIGURATION */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
            <Cpu className="w-4 h-4" />
            <span>3. AI Configuration (Google Gemini Free Tier)</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1">
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5">
              <span className="text-[11px] text-[#8E8E8E] block">Gemini API Status</span>
              <span className="text-xs font-semibold text-[#36C99A] mt-0.5 block">
                ● {health?.status === 'healthy' ? 'Connected & Healthy' : 'Active'}
              </span>
            </div>
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5">
              <span className="text-[11px] text-[#8E8E8E] block">
                Active Gemini Free-Tier Model
              </span>
              <span className="text-xs font-mono text-[#F5F5F5] mt-0.5 block">
                {health?.configuredModel || 'gemini-3.5-flash-lite'}
              </span>
            </div>
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5">
              <span className="text-[11px] text-[#8E8E8E] block">AI Execution Mode</span>
              <span className="text-xs font-medium text-[#E9A23B] mt-0.5 block">
                {health?.aiMode || 'live_gemini_free_tier'}
              </span>
            </div>
          </div>
          <p className="text-[11px] text-[#8E8E8E]">
            API keys are stored strictly on the backend (`backend/.env`) and never exposed to the client.
          </p>
        </section>

        {/* 4. CONNECTED ACCOUNTS */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
              <Link2 className="w-4 h-4" />
              <span>4. Connected Accounts & Permissions</span>
            </div>
            <button
              onClick={() => navigate('/plugins')}
              className="text-xs text-[#E9A23B] hover:underline font-medium"
            >
              Manage in Plugins Directory →
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-1">
            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="flex -space-x-1">
                  <GoogleDriveIcon className="w-4 h-4" />
                  <GoogleDocsIcon className="w-4 h-4" />
                  <GoogleSheetsIcon className="w-4 h-4" />
                  <GmailIcon className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#F5F5F5]">
                    Google Workspace (Drive, Docs, Sheets, Gmail)
                  </p>
                  <p className="text-[11px] text-[#8E8E8E]">
                    {integrations.google.connected
                      ? `Signed in as ${integrations.google.accountEmail}`
                      : 'OAuth 2.0 Ready (Workspace fallback active)'}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  integrations.google.connected
                    ? 'bg-[#1F352C] text-[#36C99A]'
                    : 'bg-[#2E2E2E] text-[#A0A0A0]'
                }`}
              >
                {integrations.google.connected ? 'Connected' : 'Ready'}
              </span>
            </div>

            <div className="bg-[#1B1B1B] border border-[#2C2C2C] rounded-xl p-3.5 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <TelegramIcon className="w-4 h-4" />
                <div>
                  <p className="text-xs font-semibold text-[#F5F5F5]">Telegram Bot</p>
                  <p className="text-[11px] text-[#8E8E8E]">
                    {integrations.telegram.connected
                      ? `@${integrations.telegram.botUsername} (Chat: ${
                          integrations.telegram.linkedChatId || 'unlinked'
                        })`
                      : 'Not connected'}
                  </p>
                </div>
              </div>
              <span
                className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${
                  integrations.telegram.connected
                    ? 'bg-[#1F352C] text-[#36C99A]'
                    : 'bg-[#2E2E2E] text-[#A0A0A0]'
                }`}
              >
                {integrations.telegram.connected ? 'Connected' : 'Off'}
              </span>
            </div>
          </div>
        </section>

        {/* 5. SECURITY & APPROVAL POLICIES */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
            <ShieldCheck className="w-4 h-4" />
            <span>5. Security & Human-in-the-Loop Approval Gates</span>
          </div>
          <div className="space-y-2">
            {[
              {
                key: 'approveEmails',
                label: 'Require human approval before sending external emails (Gmail)',
              },
              {
                key: 'approveTelegram',
                label: 'Require human approval before sending Telegram notifications',
              },
              {
                key: 'approveSheetsModify',
                label: 'Require human approval before modifying existing Google Spreadsheets',
              },
            ].map((item) => (
              <label
                key={item.key}
                className="flex items-center justify-between p-3 rounded-xl bg-[#1B1B1B] border border-[#2C2C2C] text-xs text-[#E5E5E5] cursor-pointer"
              >
                <span>{item.label}</span>
                <input
                  type="checkbox"
                  checked={(securityPrefs as any)[item.key]}
                  onChange={(e) =>
                    setSecurityPrefs({
                      ...securityPrefs,
                      [item.key]: e.target.checked,
                    })
                  }
                  className="rounded accent-[#36C99A]"
                />
              </label>
            ))}
          </div>
        </section>

        {/* 6. PERSISTENT MEMORY */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
              <Database className="w-4 h-4" />
              <span>6. Persistent Workspace Memory ({memories.length})</span>
            </div>
            {memories.length > 0 && (
              <button
                onClick={handleClearAllMemories}
                className="text-xs text-[#EF6464] hover:underline"
              >
                Clear All Memories
              </button>
            )}
          </div>

          <form onSubmit={handleAddMemory} className="flex flex-col sm:flex-row gap-2">
            <select
              value={newMemoryCat}
              onChange={(e) => setNewMemoryCat(e.target.value)}
              className="bg-[#1B1B1B] border border-[#343434] rounded-xl px-3 py-2 text-xs text-[#F5F5F5]"
            >
              <option value="user_preference">User Preference</option>
              <option value="project_context">Project Context</option>
              <option value="workflow_instruction">Workflow Instruction</option>
              <option value="reusable_knowledge">Reusable Knowledge</option>
            </select>
            <input
              type="text"
              value={newMemoryContent}
              onChange={(e) => setNewMemoryContent(e.target.value)}
              placeholder="Add a persistent rule or preference (e.g. Always format currency in USD and highlight top 5 products)..."
              className="flex-1 bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5]"
            />
            <button
              type="submit"
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#E9A23B] text-[#151515] font-semibold text-xs shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Save Memory</span>
            </button>
          </form>

          <div className="space-y-2 max-h-64 overflow-y-auto">
            {memories.length === 0 ? (
              <p className="text-xs text-[#8E8E8E] py-3 text-center">
                No memories saved yet. Completed tasks automatically store summaries here.
              </p>
            ) : (
              memories.map((m) => (
                <div
                  key={m.id}
                  className="p-3 rounded-xl bg-[#1B1B1B] border border-[#2C2C2C] flex items-start justify-between gap-3"
                >
                  <div className="flex-1 min-w-0">
                    <span className="text-[10px] uppercase tracking-wider px-2 py-0.5 rounded bg-[#282828] text-[#E9A23B]">
                      {m.category}
                    </span>
                    {editingMemoryId === m.id ? (
                      <div className="flex items-center gap-2 mt-2">
                        <input
                          type="text"
                          value={editingMemoryText}
                          onChange={(e) => setEditingMemoryText(e.target.value)}
                          className="flex-1 bg-[#242424] border border-[#3A3A3A] rounded-lg px-2.5 py-1 text-xs text-[#F5F5F5]"
                        />
                        <button
                          onClick={() => handleUpdateMemory(m.id)}
                          className="p-1 text-[#36C99A]"
                        >
                          <Check className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => setEditingMemoryId(null)}
                          className="p-1 text-[#A0A0A0]"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-[#E5E5E5] mt-1.5 leading-relaxed">
                        {m.content}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        setEditingMemoryId(m.id);
                        setEditingMemoryText(m.content);
                      }}
                      className="p-1.5 text-[#8E8E8E] hover:text-[#F5F5F5]"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDeleteMemory(m.id)}
                      className="p-1.5 text-[#8E8E8E] hover:text-[#EF6464]"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 7. WORKSPACE PREFERENCES */}
        <section className="bg-[#242424] border border-[#323232] rounded-2xl p-5 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
            <Sliders className="w-4 h-4" />
            <span>7. Workspace Preferences</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
            <div>
              <label className="block text-xs text-[#A0A0A0] mb-1">
                Default Lead Agent for New Conversations
              </label>
              <select
                value={workspacePrefs.defaultAgent}
                onChange={(e) => {
                  localStorage.setItem('anavya_default_agent', e.target.value);
                  setWorkspacePrefs({ ...workspacePrefs, defaultAgent: e.target.value });
                  setBanner('Default lead agent updated.');
                }}
                className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5]"
              >
                <option value="coordinator">Coordinator Agent (Recommended)</option>
                <option value="analyst">Analyst Agent</option>
                <option value="researcher">Researcher Agent</option>
                <option value="writer">Writer Agent</option>
                <option value="developer">Developer Agent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-[#A0A0A0] mb-1">
                Default Output Style
              </label>
              <select
                value={workspacePrefs.defaultOutputStyle}
                onChange={(e) => {
                  localStorage.setItem('anavya_output_style', e.target.value);
                  setWorkspacePrefs({
                    ...workspacePrefs,
                    defaultOutputStyle: e.target.value,
                  });
                  setBanner('Default output style updated.');
                }}
                className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5]"
              >
                <option value="executive_report">Executive Report with Tables</option>
                <option value="markdown">Structured Markdown</option>
                <option value="concise_bullets">Concise Bullet Points</option>
              </select>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};
