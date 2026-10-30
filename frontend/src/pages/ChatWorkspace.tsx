import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus,
  Send,
  Monitor,
  ExternalLink,
  FileText,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Download,
  ChevronDown,
  ChevronUp,
  Edit3,
  Check,
  X,
} from 'lucide-react';
import { useWorkspaceStore, ChatMessageItem } from '../context/useWorkspaceStore';
import { AgentAvatar } from '../components/Sidebar';
import {
  ApplicationIcon,
  resolveAppIdentity,
  GoogleSheetsIcon,
  GoogleDocsIcon,
  GoogleDriveIcon,
  GmailIcon,
  TelegramIcon,
  AnavyaLogo,
} from '../components/BrandIcons';
import { api, API_BASE_URL } from '../api/client';

export const ChatWorkspace: React.FC = () => {
  const navigate = useNavigate();
  const {
    conversations,
    activeConversationId,
    messages,
    workspaceFiles,
    isSending,
    liveBanner,
    sendMessage,
    resolveApproval,
    fetchWorkspaceFiles,
    selectConversation,
  } = useWorkspaceStore();

  const [input, setInput] = useState('');
  const [uploading, setUploading] = useState(false);
  const [uploadNotice, setUploadNotice] = useState<string | null>(null);
  const [expandedTechIds, setExpandedTechIds] = useState<Record<string, boolean>>({});
  const [editingApprovalId, setEditingApprovalId] = useState<string | null>(null);
  const [draftEdits, setDraftEdits] = useState<{
    recipient: string;
    subject: string;
    bodyDraft: string;
  }>({ recipient: '', subject: '', bodyDraft: '' });

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);

  const activeConv = conversations.find((c) => c.id === activeConversationId);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, liveBanner]);

  useEffect(() => {
    if (!activeConversationId && conversations.length > 0) {
      selectConversation(conversations[0].id);
    }
  }, [activeConversationId, conversations, selectConversation]);

  const toggleTechDetails = (id: string) => {
    setExpandedTechIds((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || isSending) return;
    setInput('');
    await sendMessage(trimmed);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadNotice(null);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/workspace/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploaded = res.data.data.file;
      await fetchWorkspaceFiles();
      setUploadNotice(`Attached "${uploaded.filename}" to Anavya workspace`);
      if (!input.trim()) {
        setInput(
          `Analyze ${uploaded.filename}, identify the top five products, compare performance, and generate a professional report.`
        );
      }
    } catch (err: any) {
      setUploadNotice(
        err?.response?.data?.error?.message || 'File upload failed'
      );
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const renderStatusPill = (status?: string) => {
    const s = (status || 'completed').toLowerCase();
    if (s === 'running' || s === 'planning') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#E9A23B]/15 text-[#E9A23B] font-medium inline-flex items-center gap-1">
          <Loader2 className="w-3 h-3 animate-spin" />
          Running
        </span>
      );
    }
    if (s === 'queued' || s === 'pending') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0] font-medium">
          ● Queued
        </span>
      );
    }
    if (s === 'waiting_for_approval') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#E9A23B]/15 text-[#E9A23B] font-medium">
          ● Waiting for approval
        </span>
      );
    }
    if (s === 'failed') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#EF6464]/15 text-[#EF6464] font-medium">
          ● Failed
        </span>
      );
    }
    if (s === 'cancelled') {
      return (
        <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#303030] text-[#A0A0A0] font-medium">
          ● Cancelled
        </span>
      );
    }
    return (
      <span className="px-2.5 py-0.5 rounded-full text-[11px] bg-[#1F352C] text-[#36C99A] font-medium">
        ● Completed
      </span>
    );
  };

  const renderMessageItem = (msg: ChatMessageItem) => {
    const meta = msg.metadata || {};

    // 1. System Rename Event
    if (msg.senderType === 'system' && meta.type === 'rename_event') {
      return (
        <div key={msg.id} className="py-2 text-center">
          <span className="text-xs text-[#787878]">{msg.content}</span>
        </div>
      );
    }

    // 2. Right-aligned User Message (Cream/Light rounded bubble matching Reference Image 2)
    if (msg.senderType === 'user') {
      return (
        <div key={msg.id} className="flex justify-end my-3.5">
          <div className="max-w-[76%] bg-[#E6E4E0] text-[#171717] px-5 py-3.5 rounded-2xl shadow-sm">
            <p className="text-[14px] leading-relaxed whitespace-pre-wrap font-normal">
              {msg.content}
            </p>
          </div>
        </div>
      );
    }

    // 3. Human-in-the-Loop Approval Card inside Chat (with Approve and Send, Reject, and Edit Draft)
    if (msg.senderType === 'approval' || meta.type === 'approval_card') {
      const approvalId = msg.approvalId || meta.approvalId;
      const args = meta.actionArguments || {};
      const actionName = meta.actionName || '';
      const { appName } = resolveAppIdentity(meta.appName || actionName || msg.senderName);
      const isEditing = editingApprovalId === approvalId;
      const resolvedMsg = approvalId
        ? messages.find(
            (m) =>
              (m.approvalId || m.metadata?.approvalId) === approvalId &&
              (m.metadata?.type === 'approval_executed' || m.metadata?.type === 'approval_rejected')
          )
        : undefined;
      const resolvedState: 'sent' | 'rejected' | null = resolvedMsg
        ? resolvedMsg.metadata?.type === 'approval_rejected'
          ? 'rejected'
          : 'sent'
        : null;
      const finalArgs = args;
      const isEmail =
        appName === 'Gmail' ||
        actionName === 'gmail.send_message' ||
        actionName === 'send_email';

      return (
        <div key={msg.id} className="my-3.5 max-w-[84%]">
          <div className="bg-[#252525] border border-[#383838] rounded-2xl p-4 shadow-md">
            <div className="flex items-center justify-between mb-2.5">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#1C1C1C] border border-[#323232] flex items-center justify-center shrink-0">
                  <ApplicationIcon appOrTool={appName} className="w-4 h-4" />
                </div>
                <div>
                  <span className="text-xs font-semibold text-[#F5F5F5] block">
                    {appName}
                  </span>
                  <span className="text-[11px] text-[#A0A0A0]">
                    {actionName === 'telegram.send_message'
                      ? 'Send notification message to linked Telegram chat'
                      : isEmail
                      ? `Send email to ${args.recipient || 'client@example.com'}`
                      : `Execute ${actionName}`}
                  </span>
                </div>
              </div>
              {resolvedState === 'sent'
                ? renderStatusPill('completed')
                : resolvedState === 'rejected'
                ? renderStatusPill('cancelled')
                : renderStatusPill('waiting_for_approval')}
            </div>

            <p className="text-xs text-[#D0D0D0] mb-3">
              {resolvedState === 'sent'
                ? `✓ ${resolvedMsg?.content || 'Approved and sent.'}`
                : resolvedState === 'rejected'
                ? 'Rejected — this action was not sent.'
                : msg.content}
            </p>

            {isEditing ? (
              <div className="bg-[#1A1A1A] border border-[#383838] rounded-xl p-3.5 mb-3 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-[#E9A23B]">
                    Edit Draft Before Sending
                  </span>
                  <button
                    onClick={() => setEditingApprovalId(null)}
                    className="text-[#A0A0A0] hover:text-[#F5F5F5]"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {isEmail && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] text-[#8E8E8E] mb-1">
                        Recipient Email
                      </label>
                      <input
                        type="email"
                        value={draftEdits.recipient}
                        onChange={(e) =>
                          setDraftEdits({ ...draftEdits, recipient: e.target.value })
                        }
                        className="w-full bg-[#242424] border border-[#363636] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] text-[#8E8E8E] mb-1">
                        Subject Line
                      </label>
                      <input
                        type="text"
                        value={draftEdits.subject}
                        onChange={(e) =>
                          setDraftEdits({ ...draftEdits, subject: e.target.value })
                        }
                        className="w-full bg-[#242424] border border-[#363636] rounded-lg px-2.5 py-1.5 text-xs text-[#F5F5F5] focus:outline-none focus:border-[#E9A23B]"
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-[10px] text-[#8E8E8E] mb-1">
                    Message Content
                  </label>
                  <textarea
                    rows={4}
                    value={draftEdits.bodyDraft}
                    onChange={(e) =>
                      setDraftEdits({ ...draftEdits, bodyDraft: e.target.value })
                    }
                    className="w-full bg-[#242424] border border-[#363636] rounded-lg p-2.5 text-xs text-[#F5F5F5] font-mono focus:outline-none focus:border-[#E9A23B]"
                  />
                </div>
              </div>
            ) : (
              (args.bodyDraft || args.text || args.subject) && (
                <div className="bg-[#1A1A1A] border border-[#2E2E2E] rounded-xl p-3 mb-3 text-xs text-[#E5E5E5] space-y-1.5">
                  {args.recipient && (
                    <div className="text-[11px] text-[#A0A0A0] border-b border-[#262626] pb-1.5">
                      <span className="font-semibold text-[#F5F5F5]">To:</span> {args.recipient}{' '}
                      {args.subject && (
                        <>
                          • <span className="font-semibold text-[#F5F5F5]">Subject:</span>{' '}
                          {args.subject}
                        </>
                      )}
                    </div>
                  )}
                  <div className="whitespace-pre-wrap font-mono text-[11px] leading-relaxed">
                    {args.bodyDraft || args.text}
                  </div>
                </div>
              )
            )}

            {approvalId && !resolvedState && (
              <div className="flex items-center flex-wrap gap-2.5 pt-1">
                <button
                  disabled={isSending}
                  onClick={() => {
                    const editedPayload = isEditing
                      ? {
                          recipient: draftEdits.recipient || args.recipient,
                          subject: draftEdits.subject || args.subject,
                          bodyDraft: draftEdits.bodyDraft,
                          text: draftEdits.bodyDraft,
                        }
                      : undefined;
                    setEditingApprovalId(null);
                    resolveApproval(approvalId, 'approve', 'Approve and Send', editedPayload);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#36C99A] hover:bg-[#2eb387] text-[#151515] font-semibold text-xs transition disabled:opacity-50"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isEditing ? 'Save & Send' : 'Approve and Send'}</span>
                </button>

                {!isEditing && (
                  <button
                    disabled={isSending}
                    onClick={() => {
                      setEditingApprovalId(approvalId);
                      setDraftEdits({
                        recipient: args.recipient || 'client@example.com',
                        subject: args.subject || 'Anavya Executive Report',
                        bodyDraft: args.bodyDraft || args.text || '',
                      });
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#303030] hover:bg-[#3A3A3A] text-[#F5F5F5] text-xs transition disabled:opacity-50"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#E9A23B]" />
                    <span>Edit Draft</span>
                  </button>
                )}

                <button
                  disabled={isSending}
                  onClick={() => {
                    setEditingApprovalId(null);
                    resolveApproval(approvalId, 'reject', 'Rejected by user');
                  }}
                  className="px-3.5 py-1.5 rounded-lg bg-[#303030] hover:bg-[#EF6464]/20 hover:text-[#EF6464] text-[#F5F5F5] text-xs transition disabled:opacity-50"
                >
                  Reject
                </button>
              </div>
            )}
          </div>
        </div>
      );
    }

    // 4. Application-Identifiable Tool Execution Card (Never generic 3-dots!)
    if (msg.senderType === 'tool' || meta.type === 'tool_result' || meta.type === 'approval_executed') {
      const output = meta.output || meta.executionResult || {};
      const toolName = meta.toolName || meta.actionName || msg.senderName || '';
      const { appName } = resolveAppIdentity(meta.appName || toolName || msg.senderName);
      const actionLabel =
        meta.actionLabel ||
        (meta.type === 'approval_executed'
          ? `Approved action executed via ${appName}`
          : `Executed ${toolName}`);

      const topProducts =
        output.topProductsByRevenue ||
        output.analysis?.topProductsByRevenue ||
        [];
      const driveFiles = output.files || [];
      const gmailMessages = output.messages || [];
      const isExpanded = Boolean(expandedTechIds[msg.id]);

      return (
        <div key={msg.id} className="my-2.5 max-w-[84%]">
          <div className="bg-[#242424] border border-[#323232] rounded-2xl p-4 shadow-sm">
            {/* Application Header with Official SVG Brand Icon */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="w-7 h-7 rounded-lg bg-[#1B1B1B] border border-[#303030] flex items-center justify-center shrink-0">
                  <ApplicationIcon appOrTool={appName} className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-[#F5F5F5]">
                      {appName}
                    </span>
                    <span className="text-[11px] text-[#8E8E8E] truncate">
                      • {actionLabel}
                    </span>
                  </div>
                </div>
              </div>
              {renderStatusPill(meta.status || 'completed')}
            </div>

            {/* Result Summary */}
            <p className="text-xs text-[#D8D8D8] leading-relaxed">{msg.content}</p>

            {/* Google Docs Direct Link */}
            {output.documentUrl && (
              <div className="mt-2.5 pt-2.5 border-t border-[#323232] flex items-center justify-between">
                <span className="text-xs text-[#A0A0A0] truncate">
                  {output.title || `Google Doc ID: ${output.documentId}`}
                </span>
                <a
                  href={output.documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#E9A23B] hover:underline font-medium"
                >
                  <span>Open in Google Docs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Google Sheets Direct Link */}
            {output.spreadsheetUrl && (
              <div className="mt-2.5 pt-2.5 border-t border-[#323232] flex items-center justify-between">
                <span className="text-xs text-[#A0A0A0] truncate">
                  {output.title || `Google Sheet ID: ${output.spreadsheetId}`}
                </span>
                <a
                  href={output.spreadsheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 text-xs text-[#36C99A] hover:underline font-medium"
                >
                  <span>Open in Google Sheets</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}

            {/* Google Drive Files Preview */}
            {driveFiles.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-[#323232] space-y-1.5">
                {driveFiles.slice(0, 4).map((f: any, idx: number) => (
                  <div
                    key={idx}
                    className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded-lg bg-[#1C1C1C]"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <ApplicationIcon appOrTool="Google Drive" className="w-3.5 h-3.5 shrink-0" />
                      <span className="text-[#F5F5F5] truncate">{f.name}</span>
                    </div>
                    {f.webViewLink && (
                      <a
                        href={f.webViewLink}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[11px] text-[#E9A23B] hover:underline shrink-0 ml-2"
                      >
                        Open
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Gmail Messages Preview */}
            {gmailMessages.length > 0 && (
              <div className="mt-2.5 pt-2.5 border-t border-[#323232] space-y-1.5">
                {gmailMessages.slice(0, 3).map((m: any, idx: number) => (
                  <div
                    key={idx}
                    className="text-xs px-2.5 py-2 rounded-lg bg-[#1C1C1C] space-y-0.5"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-[#F5F5F5] truncate">{m.subject}</span>
                      <span className="text-[10px] text-[#8E8E8E]">{m.from}</span>
                    </div>
                    <p className="text-[11px] text-[#A0A0A0] truncate">{m.snippet}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Embedded Workspace Window Preview for Top Products (Reference Image 2 style) */}
            {topProducts.length > 0 && (
              <div className="mt-3 rounded-xl overflow-hidden border border-[#333333] bg-gradient-to-br from-[#232927] via-[#1c1f24] to-[#29221c] p-3">
                <div className="bg-[#161616]/95 border border-[#2E2E2E] rounded-lg p-3 shadow-lg">
                  <div className="flex items-center justify-between pb-2 mb-2 border-b border-[#262626]">
                    <div className="flex items-center gap-2">
                      <GoogleSheetsIcon className="w-3.5 h-3.5" />
                      <span className="text-[11px] text-[#D0D0D0] font-medium">
                        Google Sheets Analysis — Total Revenue: $
                        {Number(
                          output.GrandTotalRevenue ||
                            output.analysis?.GrandTotalRevenue ||
                            0
                        ).toLocaleString()}
                      </span>
                    </div>
                    <span className="text-[10px] text-[#787878]">
                      {output.rowCount || output.analysis?.rowCount || 0} rows
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {topProducts.slice(0, 5).map((p: any, idx: number) => (
                      <div
                        key={idx}
                        className="flex items-center justify-between text-xs py-1 px-2 rounded bg-[#1F1F1F]"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <CheckCircle2 className="w-3.5 h-3.5 text-[#36C99A] shrink-0" />
                          <span className="text-[#F5F5F5] truncate font-medium">
                            {p.product}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[#A0A0A0] text-[11px]">
                            ${Number(p.totalRevenue).toLocaleString()}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-[#2B2B2B] text-[10px] text-[#E9A23B]">
                            {p.revenueSharePercent}%
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Expandable Technical Details */}
            <div className="mt-2.5 pt-2 border-t border-[#2E2E2E]">
              <button
                type="button"
                onClick={() => toggleTechDetails(msg.id)}
                className="inline-flex items-center gap-1 text-[11px] text-[#8E8E8E] hover:text-[#D0D0D0] transition"
              >
                {isExpanded ? (
                  <>
                    <ChevronUp className="w-3 h-3" />
                    <span>Hide technical details</span>
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3 h-3" />
                    <span>Expand technical details ({toolName || appName})</span>
                  </>
                )}
              </button>
              {isExpanded && (
                <pre className="mt-2 p-2.5 rounded-lg bg-[#171717] border border-[#2C2C2C] text-[10px] text-[#A0A0A0] overflow-x-auto max-h-48 font-mono">
                  {JSON.stringify(
                    {
                      application: appName,
                      tool: toolName,
                      agentRole: msg.agentRole || 'specialist',
                      timestamp: msg.createdAt,
                      output,
                    },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          </div>
        </div>
      );
    }

    // 5. Error Message Card
    if (meta.type === 'error' || meta.type === 'error_card') {
      return (
        <div key={msg.id} className="my-2.5 max-w-[84%]">
          <div className="bg-[#2A1C1C] border border-[#EF6464]/40 rounded-2xl p-4">
            <div className="flex items-center justify-between mb-1.5">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-[#EF6464]" />
                <span className="text-xs font-semibold text-[#EF6464]">
                  {msg.senderName || 'Execution Alert'}
                </span>
              </div>
              {renderStatusPill('failed')}
            </div>
            <p className="text-xs text-[#F5F5F5] whitespace-pre-wrap">
              {msg.content}
            </p>
            {(msg.content.includes('Connected Apps') ||
              msg.content.includes('not connected') ||
              msg.content.includes('Plugins')) && (
              <button
                onClick={() => navigate('/plugins')}
                className="mt-2.5 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#303030] hover:bg-[#3A3A3A] text-xs text-[#E9A23B] font-medium transition"
              >
                <span>Open Plugins Directory</span>
                <ExternalLink className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      );
    }

    // 6. Connection Check Notice Bubble (Reference Image 2 style: "Checking what's connected...")
    if (meta.type === 'connection_check') {
      return (
        <div key={msg.id} className="my-2.5 max-w-[84%] space-y-2.5">
          <div className="bg-[#2B2B2B] text-[#F5F5F5] px-4 py-3 rounded-2xl text-[13px] leading-relaxed">
            {msg.content}
          </div>
          {Array.isArray(meta.missing) && meta.missing.length > 0 && (
            <div className="bg-[#252525] border border-[#333333] rounded-2xl p-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#1B1B1B] border border-[#303030] flex items-center justify-center">
                  <ApplicationIcon appOrTool={meta.missing[0]} className="w-4 h-4" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-[#F5F5F5]">Anavya Computer</p>
                  <p className="text-xs text-[#A0A0A0] mt-0.5">
                    Sign in to {meta.missing.join(' & ')} in Plugins so I can access your live account.
                  </p>
                </div>
              </div>
              <button
                onClick={() => navigate('/plugins')}
                className="px-3.5 py-1.5 rounded-lg bg-[#E9A23B] text-[#151515] font-semibold text-xs hover:opacity-90 transition shrink-0"
              >
                Connect Plugin
              </button>
            </div>
          )}
        </div>
      );
    }

    // 7. Standard Agent Execution Card / Final Response
    const artifacts: any[] = meta.artifacts || [];

    return (
      <div key={msg.id} className="my-3.5 max-w-[84%]">
        <div className="bg-[#262626] border border-[#333333] rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 min-w-0">
              <AgentAvatar role={msg.agentRole || 'coordinator'} size="sm" />
              <span className="text-xs font-semibold text-[#F5F5F5]">
                {msg.senderName || 'Coordinator Agent'}
              </span>
              {meta.subtitle && (
                <span className="text-[11px] text-[#A0A0A0] truncate max-w-[260px]">
                  • {meta.subtitle}
                </span>
              )}
            </div>
            {renderStatusPill(meta.status || 'completed')}
          </div>

          <div className="text-[13px] text-[#E8E8E8] leading-relaxed whitespace-pre-wrap">
            {msg.content}
          </div>

          {artifacts.length > 0 && (
            <div className="mt-3 pt-3 border-t border-[#333333] flex flex-wrap gap-2">
              {artifacts.map((art, i) => {
                const isExternal = Boolean(art.externalUrl);
                const href = isExternal
                  ? art.externalUrl
                  : `${API_BASE_URL.replace('/api/v1', '')}${art.downloadUrl}`;

                return (
                  <a
                    key={i}
                    href={href}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C1C] hover:bg-[#303030] border border-[#383838] text-xs text-[#F5F5F5] transition"
                  >
                    {art.fileType === 'google_doc' ? (
                      <GoogleDocsIcon className="w-3.5 h-3.5" />
                    ) : art.fileType === 'google_sheet' ? (
                      <GoogleSheetsIcon className="w-3.5 h-3.5" />
                    ) : art.fileType === 'google_drive' ? (
                      <GoogleDriveIcon className="w-3.5 h-3.5" />
                    ) : (
                      <FileText className="w-3.5 h-3.5 text-[#E9A23B]" />
                    )}
                    <span className="font-medium">{art.filename}</span>
                    {isExternal ? (
                      <ExternalLink className="w-3 h-3 text-[#A0A0A0]" />
                    ) : (
                      <Download className="w-3 h-3 text-[#A0A0A0]" />
                    )}
                  </a>
                );
              })}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex flex-col h-screen bg-[#202020] overflow-hidden">
      {/* Top Chat Header (Reference Image 2 style) */}
      <header className="h-14 pl-14 md:pl-6 pr-6 border-b border-[#2A2A2A] flex items-center justify-between shrink-0 bg-[#202020]">
        <div className="flex items-center gap-3 min-w-0">
          <AgentAvatar role={activeConv?.agentRole || 'coordinator'} size="sm" />
          <h1 className="text-sm font-semibold text-[#F5F5F5] truncate">
            {activeConv?.title || 'Anavya Workspace'}
          </h1>
          {activeConv?.status && activeConv.status !== 'idle' && (
            <div className="hidden sm:block">
              {renderStatusPill(activeConv.status)}
            </div>
          )}
        </div>

        {/* Connected Application Indicators with Recognizable Brand Icons */}
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => navigate('/plugins')}
            className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#262626] hover:bg-[#2E2E2E] border border-[#343434] text-xs text-[#D0D0D0] transition"
            title="Manage Connected Plugins"
          >
            <div className="flex items-center -space-x-1">
              <div className="w-5 h-5 rounded-full bg-[#1C1C1C] border border-[#333] flex items-center justify-center">
                <GoogleSheetsIcon className="w-3 h-3" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#1C1C1C] border border-[#333] flex items-center justify-center">
                <GoogleDocsIcon className="w-3 h-3" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#1C1C1C] border border-[#333] flex items-center justify-center">
                <GoogleDriveIcon className="w-3 h-3" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#1C1C1C] border border-[#333] flex items-center justify-center">
                <GmailIcon className="w-3 h-3" />
              </div>
              <div className="w-5 h-5 rounded-full bg-[#1C1C1C] border border-[#333] flex items-center justify-center">
                <TelegramIcon className="w-3 h-3" />
              </div>
            </div>
            <span className="hidden lg:inline text-[11px] text-[#A0A0A0]">
              Plugins
            </span>
          </button>

          <button
            onClick={() => navigate('/history')}
            className="p-2 rounded-lg text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#2A2A2A] transition"
            title="Task Execution History & Logs"
          >
            <Monitor className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Message Area */}
      <div className="flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-3xl mx-auto">
          {messages.length === 0 ? (
            <div className="py-14 text-center space-y-5">
              <div className="flex justify-center">
                <AnavyaLogo className="w-12 h-12" />
              </div>
              <div>
                <h2 className="text-xl font-semibold text-[#F5F5F5] tracking-tight">
                  Anavya
                </h2>
                <p className="text-xs text-[#A0A0A0] mt-1">
                  Your AI workspace. Your agents. Your work, done.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-w-2xl mx-auto text-left pt-3">
                {[
                  'Analyze my sales spreadsheet, identify the top five products, create a professional report in Google Docs, and notify me on Telegram.',
                  'Search my Google Drive for recent sales files, analyze the revenue figures, and create a Gmail draft to client@example.com.',
                  'Analyze my sales CSV, calculate total revenue and category breakdown, and send an executive email via Gmail.',
                  'Design a scalable multi-agent microservice architecture and generate a technical specification document.',
                ].map((prompt, idx) => (
                  <button
                    key={idx}
                    onClick={() => setInput(prompt)}
                    className="p-3.5 rounded-xl bg-[#262626] hover:bg-[#2E2E2E] border border-[#323232] text-xs text-[#D8D8D8] leading-relaxed transition text-left"
                  >
                    "{prompt}"
                  </button>
                ))}
              </div>
            </div>
          ) : (
            messages.map((msg) => renderMessageItem(msg))
          )}

          {liveBanner && (
            <div className="my-3.5 max-w-[84%] bg-[#262626] border border-[#383838] rounded-2xl p-4 flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <Loader2 className="w-4 h-4 text-[#E9A23B] animate-spin shrink-0" />
                <span className="text-xs text-[#F5F5F5]">{liveBanner}</span>
              </div>
              {renderStatusPill('running')}
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* Bottom Fixed Chat Input Bar (Reference Image 2 style) */}
      <div className="px-6 pb-5 pt-2 bg-[#202020]">
        <div className="max-w-3xl mx-auto">
          {(uploadNotice || workspaceFiles.length > 0) && (
            <div className="flex items-center justify-between mb-2 px-1">
              <div className="flex items-center gap-2 flex-wrap">
                {uploadNotice && (
                  <span className="text-[11px] text-[#36C99A]">
                    {uploadNotice}
                  </span>
                )}
                {workspaceFiles.slice(0, 3).map((f) => (
                  <span
                    key={f.id}
                    className="text-[11px] px-2 py-0.5 rounded bg-[#282828] text-[#A0A0A0]"
                  >
                    📎 {f.filename}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="bg-[#282828] border border-[#363636] rounded-full px-3 py-2 flex items-center gap-2.5 shadow-lg focus-within:border-[#4A4A4A] transition">
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.md,.txt,.json"
              className="hidden"
              onChange={handleFileUpload}
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              title="Attach CSV / Markdown / Spreadsheet file"
              className="w-8 h-8 rounded-full bg-[#343434] hover:bg-[#404040] flex items-center justify-center text-[#D0D0D0] transition shrink-0"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Plus className="w-4 h-4" />
              )}
            </button>

            <textarea
              rows={1}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Message Anavya..."
              className="flex-1 bg-transparent text-sm text-[#F5F5F5] placeholder-[#787878] resize-none focus:outline-none max-h-28 overflow-y-auto py-1"
            />

            <button
              type="button"
              onClick={handleSend}
              disabled={!input.trim() || isSending}
              className="w-8 h-8 rounded-full bg-[#F5F5F5] hover:bg-white text-[#171717] flex items-center justify-center transition disabled:opacity-40 shrink-0"
              title="Send Objective (Enter)"
            >
              {isSending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
