import React, { useState, useEffect } from 'react';
import {
  Plus,
  Save,
  Copy,
  Trash2,
  Play,
  Sparkles,
  CheckCircle2,
  AlertTriangle,
  Shield,
  ChevronDown,
  ChevronUp,
  Loader2,
  Lock,
  Power,
  FileCode2,
} from 'lucide-react';
import { api } from '../api/client';
import { AgentAvatar } from '../components/Sidebar';
import {
  GoogleSheetsIcon,
  GoogleDocsIcon,
  GoogleDriveIcon,
  GmailIcon,
  TelegramIcon,
  ApplicationIcon,
} from '../components/BrandIcons';

const PERSONALITY_OPTIONS = [
  'Professional',
  'Friendly',
  'Concise',
  'Analytical',
  'Creative',
  'Formal',
  'Technical',
  'Custom',
];

const CATEGORY_OPTIONS = [
  'Research',
  'Data and Analytics',
  'Writing',
  'Operations',
  'Customer Communication',
  'Development',
  'Custom',
];

const ACCENT_COLORS = [
  '#F59E0B',
  '#14B8A6',
  '#3B82F6',
  '#A855F7',
  '#10B981',
  '#EC4899',
  '#F97316',
  '#EF4444',
];

const TOOL_INTEGRATION_GROUPS = [
  {
    id: 'google_sheets',
    name: 'Google Sheets',
    icon: <GoogleSheetsIcon className="w-4 h-4" />,
    tools: [
      { id: 'google_sheets.read', label: 'Read spreadsheets' },
      { id: 'google_sheets.list_spreadsheets', label: 'List spreadsheets' },
      { id: 'google_sheets.append_rows', label: 'Append rows (Approval gated)' },
      { id: 'google_sheets.update_range', label: 'Update cells (Approval gated)' },
      { id: 'csv_analyzer', label: 'Analyze spreadsheet & CSV data deterministically' },
    ],
  },
  {
    id: 'google_docs',
    name: 'Google Docs',
    icon: <GoogleDocsIcon className="w-4 h-4" />,
    tools: [
      { id: 'google_docs.create_document', label: 'Create documents' },
      { id: 'google_docs.read_document', label: 'Read documents' },
      { id: 'google_docs.append_content', label: 'Append content' },
      { id: 'google_docs.update_content', label: 'Update content' },
      { id: 'file_writer', label: 'Write Markdown report artifacts' },
    ],
  },
  {
    id: 'google_drive',
    name: 'Google Drive',
    icon: <GoogleDriveIcon className="w-4 h-4" />,
    tools: [
      { id: 'google_drive.list_files', label: 'List files' },
      { id: 'google_drive.search_files', label: 'Search files' },
      { id: 'google_drive.get_file_metadata', label: 'Read file metadata' },
      { id: 'google_drive.download_file', label: 'Download supported files' },
      { id: 'google_drive.upload_file', label: 'Upload generated files' },
    ],
  },
  {
    id: 'gmail',
    name: 'Gmail',
    icon: <GmailIcon className="w-4 h-4" />,
    tools: [
      { id: 'gmail.list_messages', label: 'Read emails' },
      { id: 'gmail.search_messages', label: 'Search emails' },
      { id: 'gmail.create_draft', label: 'Create drafts' },
      { id: 'gmail.send_message', label: 'Send emails (Requires approval)' },
    ],
  },
  {
    id: 'telegram',
    name: 'Telegram',
    icon: <TelegramIcon className="w-4 h-4" />,
    tools: [
      { id: 'telegram.send_message', label: 'Send notifications & request approval' },
    ],
  },
];

const EXAMPLE_SYSTEM_TEMPLATE = `You are a senior financial analyst. When analyzing spreadsheets, always calculate total revenue, top performing products, growth trends, and unusual values. Present results clearly with bullet points and executive summaries.`;

export const AgentsPage: React.FC = () => {
  const [agents, setAgents] = useState<any[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Expanded tool groups state
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({
    google_sheets: true,
    google_docs: true,
    google_drive: false,
    gmail: true,
    telegram: false,
  });

  // Studio Form State (Sections A - I)
  const [name, setName] = useState('');
  const [role, setRole] = useState<
    'coordinator' | 'researcher' | 'analyst' | 'writer' | 'developer'
  >('analyst');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('Data and Analytics');
  const [avatar, setAvatar] = useState('analyst');
  const [accentColor, setAccentColor] = useState('#F59E0B');
  const [intro, setIntro] = useState('');
  const [personality, setPersonality] = useState('Professional');
  const [systemInstructions, setSystemInstructions] = useState('');
  const [enabledTools, setEnabledTools] = useState<string[]>([]);
  const [isSystem, setIsSystem] = useState(false);
  const [isDraft, setIsDraft] = useState(false);
  const [isActive, setIsActive] = useState(true);

  const [actionPermissions, setActionPermissions] = useState({
    allowReadOnly: true,
    allowDocCreation: true,
    allowSheetModification: false,
    allowEmailDrafting: true,
    allowEmailSending: false,
    allowTelegramMessaging: false,
    requireApproval: true,
  });

  const [executionBehavior, setExecutionBehavior] = useState({
    maxSteps: 5,
    maxRetries: 1,
    timeoutSec: 60,
    canDelegate: false,
    requireApproval: true,
    canCollaborate: true,
    saveToMemory: true,
  });

  const [outputPreferences, setOutputPreferences] = useState({
    responseLength: 'balanced' as 'concise' | 'balanced' | 'detailed',
    outputFormat: 'markdown' as
      | 'markdown'
      | 'bullet_points'
      | 'executive_report'
      | 'json'
      | 'code_first',
    tone: 'Executive & clear',
    formattingPreferences: 'Structured sections with bullet points and summary tables',
    requireSummaries: true,
    requireCitations: true,
  });

  const [memorySettings, setMemorySettings] = useState({
    useConversationContext: true,
    useUserPreferences: true,
    saveTaskSummaries: true,
    saveReusableKnowledge: true,
    disableMemory: false,
  });

  // Section J: Test Agent Panel State
  const [sampleInstruction, setSampleInstruction] = useState(
    'Analyze my Q1 sales spreadsheet, calculate total revenue and top 5 products, create a report in Google Docs, and send an email summary.'
  );
  const [testingAgent, setTestingAgent] = useState(false);
  const [testResult, setTestResult] = useState<any | null>(null);

  const fetchAgents = async (keepSelectionId?: string) => {
    setLoading(true);
    try {
      const res = await api.get('/agents');
      const list = res.data.data.agents || [];
      setAgents(list);
      if (keepSelectionId) {
        const found = list.find((a: any) => a.id === keepSelectionId);
        if (found) {
          populateForm(found);
          return;
        }
      }
      if (list.length > 0 && !selectedId && !isCreatingNew) {
        populateForm(list[0]);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAgents();
  }, []);

  const populateForm = (agent: any) => {
    setIsCreatingNew(false);
    setSelectedId(agent.id);
    setName(agent.name || '');
    setRole(agent.role || 'analyst');
    setDescription(agent.description || '');
    setCategory(agent.category || 'Operations');
    setAvatar(agent.avatar || agent.role || 'coordinator');
    setAccentColor(agent.accentColor || '#F59E0B');
    setIntro(agent.intro || '');
    setPersonality(agent.personality || 'Professional');
    setSystemInstructions(agent.systemInstructions || '');
    setEnabledTools(Array.isArray(agent.enabledTools) ? agent.enabledTools : []);
    setIsSystem(Boolean(agent.isSystem));
    setIsDraft(Boolean(agent.isDraft));
    setIsActive(agent.isActive ?? true);

    setActionPermissions({
      allowReadOnly: agent.actionPermissions?.allowReadOnly ?? true,
      allowDocCreation: agent.actionPermissions?.allowDocCreation ?? true,
      allowSheetModification: agent.actionPermissions?.allowSheetModification ?? false,
      allowEmailDrafting: agent.actionPermissions?.allowEmailDrafting ?? true,
      allowEmailSending: agent.actionPermissions?.allowEmailSending ?? false,
      allowTelegramMessaging: agent.actionPermissions?.allowTelegramMessaging ?? false,
      requireApproval: agent.actionPermissions?.requireApproval ?? true,
    });

    setExecutionBehavior({
      maxSteps: agent.executionBehavior?.maxSteps ?? 5,
      maxRetries: agent.executionBehavior?.maxRetries ?? 1,
      timeoutSec: agent.executionBehavior?.timeoutSec ?? 60,
      canDelegate: agent.executionBehavior?.canDelegate ?? false,
      requireApproval: agent.executionBehavior?.requireApproval ?? true,
      canCollaborate: agent.executionBehavior?.canCollaborate ?? true,
      saveToMemory: agent.executionBehavior?.saveToMemory ?? true,
    });

    setOutputPreferences({
      responseLength: agent.outputPreferences?.responseLength || 'balanced',
      outputFormat: agent.outputPreferences?.outputFormat || 'markdown',
      tone: agent.outputPreferences?.tone || 'Professional',
      formattingPreferences: agent.outputPreferences?.formattingPreferences || '',
      requireSummaries: agent.outputPreferences?.requireSummaries ?? true,
      requireCitations: agent.outputPreferences?.requireCitations ?? true,
    });

    setMemorySettings({
      useConversationContext: agent.memorySettings?.useConversationContext ?? true,
      useUserPreferences: agent.memorySettings?.useUserPreferences ?? true,
      saveTaskSummaries: agent.memorySettings?.saveTaskSummaries ?? true,
      saveReusableKnowledge: agent.memorySettings?.saveReusableKnowledge ?? true,
      disableMemory: agent.memorySettings?.disableMemory ?? false,
    });

    setTestResult(null);
    setStatusBanner(null);
  };

  const handleStartCreateCustom = () => {
    setIsCreatingNew(true);
    setSelectedId(null);
    setName('Financial Revenue Specialist');
    setRole('analyst');
    setDescription(
      'Custom specialist focused on spreadsheet revenue diagnostics, growth trends, and executive reporting.'
    );
    setCategory('Data and Analytics');
    setAvatar('analyst');
    setAccentColor('#F59E0B');
    setIntro('I inspect your spreadsheets and deliver executive financial summaries.');
    setPersonality('Analytical');
    setSystemInstructions(EXAMPLE_SYSTEM_TEMPLATE);
    setEnabledTools([
      'google_sheets.read',
      'google_sheets.list_spreadsheets',
      'csv_analyzer',
      'google_docs.create_document',
      'gmail.create_draft',
    ]);
    setIsSystem(false);
    setIsDraft(false);
    setIsActive(true);
    setTestResult(null);
    setStatusBanner(null);
  };

  const toggleTool = (toolId: string) => {
    if (enabledTools.includes(toolId)) {
      setEnabledTools(enabledTools.filter((t) => t !== toolId));
    } else {
      setEnabledTools([...enabledTools, toolId]);
    }
  };

  const handleSaveAgent = async (saveAsDraft = false) => {
    setSaving(true);
    setStatusBanner(null);
    try {
      const payload = {
        name: name.trim() || 'Custom Specialist Agent',
        role,
        description,
        category,
        avatar,
        accentColor,
        intro,
        personality,
        systemInstructions,
        enabledTools,
        actionPermissions,
        executionBehavior,
        outputPreferences,
        memorySettings,
        isDraft: saveAsDraft,
        isActive: saveAsDraft ? false : isActive,
      };

      if (isCreatingNew || !selectedId) {
        const res = await api.post('/agents', payload);
        const created = res.data.data.agent;
        await fetchAgents(created.id);
        setStatusBanner({
          type: 'success',
          text: saveAsDraft
            ? `Saved "${created.name}" as draft.`
            : `Custom agent "${created.name}" created and activated!`,
        });
      } else {
        const res = await api.patch(`/agents/${selectedId}`, payload);
        const updated = res.data.data.agent;
        await fetchAgents(updated.id);
        setStatusBanner({
          type: 'success',
          text: saveAsDraft
            ? `Saved "${updated.name}" as draft.`
            : `Agent "${updated.name}" configuration saved!`,
        });
      }
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to save agent configuration',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDuplicateAgent = async () => {
    if (!selectedId) return;
    setSaving(true);
    setStatusBanner(null);
    try {
      const res = await api.post(`/agents/${selectedId}/duplicate`);
      const dup = res.data.data.agent;
      await fetchAgents(dup.id);
      setStatusBanner({
        type: 'success',
        text: `Duplicated as "${dup.name}". You can now customize or delete this copy.`,
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to duplicate agent',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteAgent = async () => {
    if (!selectedId || isSystem) return;
    setSaving(true);
    setStatusBanner(null);
    try {
      await api.delete(`/agents/${selectedId}`);
      setSelectedId(null);
      await fetchAgents();
      setStatusBanner({
        type: 'success',
        text: 'Custom agent deleted.',
      });
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Failed to delete agent',
      });
    } finally {
      setSaving(false);
    }
  };

  const handleRunTest = async () => {
    if (!sampleInstruction.trim()) return;
    setTestingAgent(true);
    setTestResult(null);
    try {
      const res = await api.post('/agents/test', {
        agentId: selectedId || undefined,
        name,
        role,
        personality,
        systemInstructions,
        enabledTools,
        actionPermissions,
        outputPreferences,
        sampleInstruction,
      });
      setTestResult(res.data.data.testResult);
    } catch (err: any) {
      setStatusBanner({
        type: 'error',
        text: err?.response?.data?.error?.message || 'Agent test run failed',
      });
    } finally {
      setTestingAgent(false);
    }
  };

  return (
    <div className="flex-1 h-screen overflow-hidden bg-[#1E1E1E] flex flex-col md:flex-row">
      {/* LEFT PANEL: AGENT LIST & CREATE BUTTON */}
      <div className="w-full md:w-[310px] border-r border-[#2B2B2B] bg-[#191919] flex flex-col h-full shrink-0">
        <div className="p-4 border-b border-[#282828] flex items-center justify-between">
          <div>
            <h1 className="text-base font-semibold text-[#F5F5F5]">Agents Studio</h1>
            <p className="text-[11px] text-[#8E8E8E]">
              Configure specialist & custom agents
            </p>
          </div>
          <button
            onClick={handleStartCreateCustom}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#E9A23B] hover:opacity-90 text-[#151515] font-semibold text-xs transition"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Create</span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            <div className="py-10 text-center text-xs text-[#8E8E8E]">
              Loading Anavya agents...
            </div>
          ) : (
            agents.map((ag) => {
              const active = !isCreatingNew && selectedId === ag.id;
              return (
                <div
                  key={ag.id}
                  onClick={() => populateForm(ag)}
                  className={`p-3 rounded-xl border cursor-pointer transition flex items-start gap-3 ${
                    active
                      ? 'bg-[#262626] border-[#E9A23B]/60'
                      : 'bg-[#202020] hover:bg-[#242424] border-[#2C2C2C]'
                  }`}
                >
                  <AgentAvatar
                    role={ag.avatar || ag.role}
                    accentColor={ag.accentColor}
                    size="md"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-semibold text-[#F5F5F5] truncate">
                        {ag.name}
                      </span>
                      {ag.isSystem ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#2E2E2E] text-[#A0A0A0]">
                          Core
                        </span>
                      ) : ag.isDraft ? (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#E9A23B]/20 text-[#E9A23B]">
                          Draft
                        </span>
                      ) : (
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[#1F352C] text-[#36C99A]">
                          Custom
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-[#9E9E9E] uppercase tracking-wider mt-0.5">
                      {ag.role} • {ag.personality || 'Professional'}
                    </p>
                    <p className="text-[11px] text-[#787878] truncate mt-1">
                      {(ag.enabledTools || []).length} tools enabled
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* RIGHT PANEL: FULL AGENT CONFIGURATION STUDIO (SECTIONS A - K) */}
      <div className="flex-1 h-full overflow-y-auto px-6 md:px-10 py-7 space-y-6">
        <div className="max-w-4xl mx-auto space-y-6 pb-16">
          {/* Top Studio Action Bar (Section K controls) */}
          <div className="bg-[#242424] border border-[#333333] rounded-2xl p-4 flex flex-wrap items-center justify-between gap-4 sticky top-0 z-20 shadow-lg">
            <div className="flex items-center gap-3">
              <AgentAvatar role={avatar || role} accentColor={accentColor} size="lg" />
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-semibold text-[#F5F5F5]">
                    {name || 'Untitled Agent'}
                  </h2>
                  {isSystem && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] bg-[#303030] text-[#D0D0D0]">
                      <Lock className="w-2.5 h-2.5" />
                      System Agent
                    </span>
                  )}
                </div>
                <p className="text-xs text-[#9E9E9E]">
                  {category} • Role: <span className="uppercase">{role}</span>
                </p>
              </div>
            </div>

            <div className="flex items-center flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setIsActive(!isActive)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium border transition ${
                  isActive
                    ? 'bg-[#1F352C] border-[#36C99A]/40 text-[#36C99A]'
                    : 'bg-[#2C2C2C] border-[#3A3A3A] text-[#A0A0A0]'
                }`}
              >
                <Power className="w-3.5 h-3.5" />
                <span>{isActive ? 'Enabled' : 'Disabled'}</span>
              </button>

              {!isCreatingNew && selectedId && (
                <button
                  type="button"
                  onClick={handleDuplicateAgent}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2E2E2E] hover:bg-[#383838] text-xs text-[#F5F5F5] transition"
                >
                  <Copy className="w-3.5 h-3.5" />
                  <span>Duplicate</span>
                </button>
              )}

              {!isSystem && !isCreatingNew && selectedId && (
                <button
                  type="button"
                  onClick={handleDeleteAgent}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#2E2E2E] hover:bg-[#EF6464]/20 hover:text-[#EF6464] text-xs text-[#D0D0D0] transition"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => handleSaveAgent(true)}
                disabled={saving}
                className="px-3 py-1.5 rounded-xl bg-[#2E2E2E] hover:bg-[#383838] text-xs text-[#D0D0D0] transition"
              >
                Save as Draft
              </button>

              <button
                type="button"
                onClick={() => handleSaveAgent(false)}
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-[#E9A23B] hover:opacity-90 text-[#151515] font-semibold text-xs transition"
              >
                {saving ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Save className="w-3.5 h-3.5" />
                )}
                <span>Save Agent</span>
              </button>
            </div>
          </div>

          {statusBanner && (
            <div
              className={`p-3.5 rounded-xl border text-xs flex items-center gap-2 ${
                statusBanner.type === 'success'
                  ? 'bg-[#1F352C]/60 border-[#36C99A]/40 text-[#36C99A]'
                  : 'bg-[#2A1C1C] border-[#EF6464]/40 text-[#EF6464]'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{statusBanner.text}</span>
            </div>
          )}

          {/* SECTION A & B: BASIC IDENTITY & AGENT ROLE */}
          <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
              A & B. Basic Identity & Specialist Role
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Agent Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
                />
              </div>

              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">
                  Specialist Role (Section B)
                </label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as any)}
                  className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
                >
                  <option value="coordinator">Coordinator</option>
                  <option value="researcher">Researcher</option>
                  <option value="analyst">Analyst</option>
                  <option value="writer">Writer</option>
                  <option value="developer">Developer</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Agent Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
                >
                  {CATEGORY_OPTIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-[#A0A0A0] mb-1">Accent Color</label>
                <div className="flex items-center gap-2 pt-1">
                  {ACCENT_COLORS.map((col) => (
                    <button
                      key={col}
                      type="button"
                      onClick={() => setAccentColor(col)}
                      className={`w-6 h-6 rounded-full border-2 transition ${
                        accentColor === col
                          ? 'border-white scale-110'
                          : 'border-transparent opacity-75 hover:opacity-100'
                      }`}
                      style={{ backgroundColor: col }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#A0A0A0] mb-1">
                Short Introduction Message
              </label>
              <input
                type="text"
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                placeholder="e.g., I inspect your spreadsheets and deliver executive financial summaries."
                className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl px-3.5 py-2 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
              />
            </div>

            <div>
              <label className="block text-xs text-[#A0A0A0] mb-1">Agent Description</label>
              <textarea
                rows={2}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl p-3 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
              />
            </div>
          </section>

          {/* SECTION C & D: PERSONALITY & SYSTEM INSTRUCTIONS */}
          <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                C & D. Personality & System Instructions
              </h3>
              <button
                type="button"
                onClick={() => setSystemInstructions(EXAMPLE_SYSTEM_TEMPLATE)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#2E2E2E] hover:bg-[#383838] text-[11px] text-[#E9A23B]"
              >
                <FileCode2 className="w-3.5 h-3.5" />
                <span>Load Financial Analyst Template</span>
              </button>
            </div>

            <div>
              <label className="block text-xs text-[#A0A0A0] mb-2">
                Personality Style (Section C)
              </label>
              <div className="flex flex-wrap gap-2">
                {PERSONALITY_OPTIONS.map((p) => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPersonality(p)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-medium transition ${
                      personality === p
                        ? 'bg-[#E9A23B] text-[#151515]'
                        : 'bg-[#1B1B1B] text-[#A0A0A0] hover:text-[#F5F5F5] border border-[#323232]'
                    }`}
                  >
                    {p}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="block text-xs text-[#A0A0A0] mb-1.5">
                System Instructions (Section D)
              </label>
              <textarea
                rows={5}
                value={systemInstructions}
                onChange={(e) => setSystemInstructions(e.target.value)}
                placeholder="Provide detailed instructions for how this agent reasons, uses tools, and structures outputs..."
                className="w-full bg-[#1B1B1B] border border-[#343434] rounded-xl p-3.5 text-xs text-[#F5F5F5] font-mono leading-relaxed focus:outline-none focus:border-[#E9A23B]"
              />
            </div>
          </section>

          {/* SECTION E: TOOL PERMISSIONS */}
          <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                  E. Tool Permissions by Application
                </h3>
                <p className="text-[11px] text-[#9E9E9E] mt-0.5">
                  Expand each connected integration to grant or revoke specific tool actions.
                </p>
              </div>
              <span className="text-xs text-[#36C99A] font-medium">
                {enabledTools.length} active tools
              </span>
            </div>

            <div className="space-y-2.5">
              {TOOL_INTEGRATION_GROUPS.map((group) => {
                const isExpanded = Boolean(expandedGroups[group.id]);
                const groupSelectedCount = group.tools.filter((t) =>
                  enabledTools.includes(t.id)
                ).length;

                return (
                  <div
                    key={group.id}
                    className="bg-[#1B1B1B] border border-[#2E2E2E] rounded-xl overflow-hidden"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setExpandedGroups({
                          ...expandedGroups,
                          [group.id]: !isExpanded,
                        })
                      }
                      className="w-full px-4 py-3 flex items-center justify-between hover:bg-[#222222] transition"
                    >
                      <div className="flex items-center gap-2.5">
                        {group.icon}
                        <span className="text-xs font-semibold text-[#F5F5F5]">
                          {group.name}
                        </span>
                        <span className="text-[11px] text-[#8E8E8E]">
                          ({groupSelectedCount}/{group.tools.length} enabled)
                        </span>
                      </div>
                      {isExpanded ? (
                        <ChevronUp className="w-4 h-4 text-[#8E8E8E]" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-[#8E8E8E]" />
                      )}
                    </button>

                    {isExpanded && (
                      <div className="px-4 pb-3 pt-1 border-t border-[#262626] grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {group.tools.map((t) => {
                          const checked = enabledTools.includes(t.id);
                          return (
                            <label
                              key={t.id}
                              className="flex items-center gap-2.5 p-2 rounded-lg bg-[#222222] hover:bg-[#282828] cursor-pointer text-xs text-[#E5E5E5]"
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleTool(t.id)}
                                className="rounded accent-[#E9A23B]"
                              />
                              <span className="truncate">{t.label}</span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          {/* SECTION F & G: ACTION PERMISSIONS & EXECUTION BEHAVIOUR */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Section F */}
            <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                F. Action Permissions
              </h3>
              <div className="space-y-2">
                {[
                  { key: 'allowReadOnly', label: 'Allow read-only actions' },
                  { key: 'allowDocCreation', label: 'Allow document creation' },
                  { key: 'allowSheetModification', label: 'Allow spreadsheet modification' },
                  { key: 'allowEmailDrafting', label: 'Allow email drafting' },
                  { key: 'allowEmailSending', label: 'Allow email sending' },
                  { key: 'allowTelegramMessaging', label: 'Allow Telegram messaging' },
                  {
                    key: 'requireApproval',
                    label: 'Require approval for external actions',
                  },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#1B1B1B] text-xs text-[#E5E5E5] cursor-pointer"
                  >
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={(actionPermissions as any)[item.key]}
                      onChange={(e) =>
                        setActionPermissions({
                          ...actionPermissions,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="rounded accent-[#E9A23B]"
                    />
                  </label>
                ))}
              </div>
            </section>

            {/* Section G */}
            <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                G. Execution Behaviour
              </h3>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#9E9E9E] mb-1">
                    Max Steps
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={8}
                    value={executionBehavior.maxSteps}
                    onChange={(e) =>
                      setExecutionBehavior({
                        ...executionBehavior,
                        maxSteps: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#9E9E9E] mb-1">
                    Max Retries
                  </label>
                  <input
                    type="number"
                    min={0}
                    max={3}
                    value={executionBehavior.maxRetries}
                    onChange={(e) =>
                      setExecutionBehavior({
                        ...executionBehavior,
                        maxRetries: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#9E9E9E] mb-1">
                    Timeout (s)
                  </label>
                  <input
                    type="number"
                    min={10}
                    max={180}
                    value={executionBehavior.timeoutSec}
                    onChange={(e) =>
                      setExecutionBehavior({
                        ...executionBehavior,
                        timeoutSec: Number(e.target.value),
                      })
                    }
                    className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                  />
                </div>
              </div>

              <div className="space-y-2 pt-1">
                {[
                  { key: 'canDelegate', label: 'Can delegate to other agents' },
                  {
                    key: 'requireApproval',
                    label: 'Must request approval before sensitive actions',
                  },
                  {
                    key: 'canCollaborate',
                    label: 'Can collaborate with specialist agents',
                  },
                  { key: 'saveToMemory', label: 'Save outputs to persistent memory' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className="flex items-center justify-between p-2 rounded-lg bg-[#1B1B1B] text-xs text-[#E5E5E5] cursor-pointer"
                  >
                    <span>{item.label}</span>
                    <input
                      type="checkbox"
                      checked={(executionBehavior as any)[item.key]}
                      onChange={(e) =>
                        setExecutionBehavior({
                          ...executionBehavior,
                          [item.key]: e.target.checked,
                        })
                      }
                      className="rounded accent-[#E9A23B]"
                    />
                  </label>
                ))}
              </div>
            </section>
          </div>

          {/* SECTION H & I: OUTPUT PREFERENCES & MEMORY SETTINGS */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Section H */}
            <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                H. Output Preferences
              </h3>
              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[11px] text-[#9E9E9E] mb-1">
                    Response Length
                  </label>
                  <select
                    value={outputPreferences.responseLength}
                    onChange={(e) =>
                      setOutputPreferences({
                        ...outputPreferences,
                        responseLength: e.target.value as any,
                      })
                    }
                    className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                  >
                    <option value="concise">Concise</option>
                    <option value="balanced">Balanced</option>
                    <option value="detailed">Detailed</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] text-[#9E9E9E] mb-1">
                    Output Format
                  </label>
                  <select
                    value={outputPreferences.outputFormat}
                    onChange={(e) =>
                      setOutputPreferences({
                        ...outputPreferences,
                        outputFormat: e.target.value as any,
                      })
                    }
                    className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                  >
                    <option value="markdown">Markdown</option>
                    <option value="bullet_points">Bullet Points</option>
                    <option value="executive_report">Executive Report</option>
                    <option value="json">Structured JSON</option>
                    <option value="code_first">Code First</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-[11px] text-[#9E9E9E] mb-1">
                  Formatting Preferences
                </label>
                <input
                  type="text"
                  value={outputPreferences.formattingPreferences}
                  onChange={(e) =>
                    setOutputPreferences({
                      ...outputPreferences,
                      formattingPreferences: e.target.value,
                    })
                  }
                  className="w-full bg-[#1B1B1B] border border-[#343434] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5]"
                />
              </div>
              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 text-xs text-[#E5E5E5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={outputPreferences.requireSummaries}
                    onChange={(e) =>
                      setOutputPreferences({
                        ...outputPreferences,
                        requireSummaries: e.target.checked,
                      })
                    }
                    className="rounded accent-[#E9A23B]"
                  />
                  <span>Include Summaries</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-[#E5E5E5] cursor-pointer">
                  <input
                    type="checkbox"
                    checked={outputPreferences.requireCitations}
                    onChange={(e) =>
                      setOutputPreferences({
                        ...outputPreferences,
                        requireCitations: e.target.checked,
                      })
                    }
                    className="rounded accent-[#E9A23B]"
                  />
                  <span>Include Citations</span>
                </label>
              </div>
            </section>

            {/* Section I */}
            <section className="bg-[#232323] border border-[#303030] rounded-2xl p-5 space-y-2.5">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#E9A23B]">
                I. Memory Settings
              </h3>
              {[
                { key: 'useConversationContext', label: 'Use conversation context' },
                { key: 'useUserPreferences', label: 'Use user preferences' },
                { key: 'saveTaskSummaries', label: 'Save task summaries' },
                { key: 'saveReusableKnowledge', label: 'Save reusable knowledge' },
                { key: 'disableMemory', label: 'Disable memory for this agent' },
              ].map((item) => (
                <label
                  key={item.key}
                  className="flex items-center justify-between p-2 rounded-lg bg-[#1B1B1B] text-xs text-[#E5E5E5] cursor-pointer"
                >
                  <span>{item.label}</span>
                  <input
                    type="checkbox"
                    checked={(memorySettings as any)[item.key]}
                    onChange={(e) =>
                      setMemorySettings({
                        ...memorySettings,
                        [item.key]: e.target.checked,
                      })
                    }
                    className="rounded accent-[#E9A23B]"
                  />
                </label>
              ))}
            </section>
          </div>

          {/* SECTION J: LIVE TEST AGENT PANEL */}
          <section className="bg-[#232323] border border-[#E9A23B]/40 rounded-2xl p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#E9A23B]" />
                <h3 className="text-xs font-semibold uppercase tracking-wider text-[#F5F5F5]">
                  J. Live Test Agent Sandbox
                </h3>
              </div>
              <span className="text-[11px] text-[#9E9E9E]">
                Simulates tool selection, permission enforcement & Gemini response
              </span>
            </div>

            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={sampleInstruction}
                onChange={(e) => setSampleInstruction(e.target.value)}
                placeholder="Enter a sample instruction to test this agent..."
                className="flex-1 bg-[#181818] border border-[#343434] rounded-xl px-3.5 py-2.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
              />
              <button
                type="button"
                onClick={handleRunTest}
                disabled={testingAgent}
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#36C99A] hover:bg-[#2eb387] text-[#151515] font-semibold text-xs transition shrink-0"
              >
                {testingAgent ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Play className="w-3.5 h-3.5" />
                )}
                <span>Test Agent</span>
              </button>
            </div>

            {testResult && (
              <div className="bg-[#181818] border border-[#2E2E2E] rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-[#262626] pb-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#F5F5F5]">
                      {testResult.agentName} ({testResult.role})
                    </span>
                    <span className="text-[11px] text-[#8E8E8E]">
                      • {testResult.durationMs}ms
                    </span>
                  </div>
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-medium ${
                      testResult.permissionIssues?.length > 0
                        ? 'bg-[#E9A23B]/15 text-[#E9A23B]'
                        : 'bg-[#1F352C] text-[#36C99A]'
                    }`}
                  >
                    ● {testResult.status.replace(/_/g, ' ')}
                  </span>
                </div>

                {/* Selected Tools & Permission Status */}
                <div>
                  <p className="text-[11px] font-semibold text-[#A0A0A0] mb-1.5">
                    Tools Selected & Permission Evaluation:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {(testResult.selectedTools || []).map((t: any, i: number) => (
                      <div
                        key={i}
                        className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-[#222222] border border-[#323232] text-xs"
                      >
                        <ApplicationIcon appOrTool={t.appName} className="w-3.5 h-3.5" />
                        <span className="text-[#F5F5F5] font-mono text-[11px]">
                          {t.toolName}
                        </span>
                        {t.status === 'allowed' && (
                          <span className="text-[10px] text-[#36C99A]">● Allowed</span>
                        )}
                        {t.status === 'requires_approval' && (
                          <span className="text-[10px] text-[#E9A23B]">
                            ● Needs Approval
                          </span>
                        )}
                        {t.status === 'blocked_by_permission' && (
                          <span className="text-[10px] text-[#EF6464]">● Blocked</span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                {/* Permission Warnings */}
                {testResult.permissionIssues?.length > 0 && (
                  <div className="p-3 rounded-lg bg-[#2A2015] border border-[#E9A23B]/40 space-y-1">
                    <div className="flex items-center gap-1.5 text-xs font-semibold text-[#E9A23B]">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      <span>Permission Issues Detected</span>
                    </div>
                    {testResult.permissionIssues.map((iss: string, idx: number) => (
                      <p key={idx} className="text-[11px] text-[#E5E5E5]">
                        • {iss}
                      </p>
                    ))}
                  </div>
                )}

                {/* Agent Response Output */}
                <div>
                  <p className="text-[11px] font-semibold text-[#A0A0A0] mb-1">
                    Agent Response Preview:
                  </p>
                  <div className="p-3 rounded-lg bg-[#202020] text-xs text-[#E5E5E5] whitespace-pre-wrap leading-relaxed max-h-60 overflow-y-auto">
                    {testResult.response}
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
};
