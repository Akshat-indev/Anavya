import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import {
  Plus,
  Search,
  MessageSquare,
  Blocks,
  Bot,
  History,
  Settings,
  Trash2,
  Edit3,
  Check,
  X,
  LogOut,
  User,
  Link2,
  Menu,
} from 'lucide-react';
import { useWorkspaceStore } from '../context/useWorkspaceStore';
import { AnavyaLogo } from './BrandIcons';

const AGENT_AVATAR_STYLES: Record<
  string,
  { bg: string; label: string }
> = {
  coordinator: { bg: '#E9A23B', label: 'Coordinator' },
  analyst: { bg: '#36C99A', label: 'Analyst' },
  writer: { bg: '#8B5CF6', label: 'Writer' },
  researcher: { bg: '#3B82F6', label: 'Researcher' },
  developer: { bg: '#F97316', label: 'Developer' },
  custom: { bg: '#EC4899', label: 'Custom Specialist' },
};

export const AgentAvatar: React.FC<{
  role?: string;
  accentColor?: string;
  size?: 'sm' | 'md' | 'lg';
}> = ({ role = 'coordinator', accentColor, size = 'md' }) => {
  const style = AGENT_AVATAR_STYLES[role] || AGENT_AVATAR_STYLES.coordinator;
  const bg = accentColor || style.bg;
  const dim =
    size === 'sm' ? 'w-6 h-6' : size === 'lg' ? 'w-11 h-11' : 'w-9 h-9';
  const eyeH =
    size === 'sm' ? 'h-1.5 w-0.5' : size === 'lg' ? 'h-2.5 w-1' : 'h-2 w-0.5';

  return (
    <div
      className={`${dim} rounded-full flex items-center justify-center shrink-0 shadow-inner relative`}
      style={{ backgroundColor: bg }}
      title={style.label}
    >
      <div className="flex items-center gap-1 -mt-0.5">
        <span className={`${eyeH} bg-[#151515] rounded-full`} />
        <span className={`${eyeH} bg-[#151515] rounded-full`} />
      </div>
    </div>
  );
};

export const Sidebar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    user,
    conversations,
    activeConversationId,
    integrations,
    fetchConversations,
    selectConversation,
    createConversation,
    renameConversation,
    deleteConversation,
    logout,
  } = useWorkspaceStore();

  const [search, setSearch] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      fetchConversations(search);
    }, 180);
    return () => clearTimeout(timer);
  }, [search, fetchConversations]);

  const handleNewConversation = async () => {
    await createConversation('New Anavya Objective');
    setMobileOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  const handleSelectConversation = async (id: string) => {
    await selectConversation(id);
    setMobileOpen(false);
    if (location.pathname !== '/') {
      navigate('/');
    }
  };

  const formatTime = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(iso);
    const now = new Date();
    const diffHours = (now.getTime() - d.getTime()) / (1000 * 60 * 60);
    if (diffHours < 24) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  const statusPreview = (conv: { status: string; lastMessagePreview: string }) => {
    if (conv.status === 'running' || conv.status === 'planning') {
      return <span className="text-[11px] text-[#E9A23B] font-medium">● Running workflow...</span>;
    }
    if (conv.status === 'waiting_for_approval') {
      return <span className="text-[11px] text-[#E9A23B] font-medium">● Waiting for approval</span>;
    }
    if (conv.status === 'completed') {
      return (
        <span className="text-xs text-[#A0A0A0] truncate">
          <span className="text-[#36C99A] font-medium">Done.</span>{' '}
          {conv.lastMessagePreview ? conv.lastMessagePreview.slice(0, 40) : ''}
        </span>
      );
    }
    if (conv.status === 'failed') {
      return <span className="text-[11px] text-[#EF6464]">● Execution failed</span>;
    }
    return <span className="text-xs text-[#A0A0A0] truncate">{conv.lastMessagePreview || 'Ready for objective'}</span>;
  };

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'AN';

  const displayName = user?.email
    ? user.email.split('@')[0]
    : 'Anavya User';

  const connectedCount =
    (integrations.google.connected ? 4 : 0) +
    (integrations.telegram.connected ? 1 : 0);

  return (
    <>
      {/* Mobile Top Toggle Button */}
      <button
        type="button"
        onClick={() => setMobileOpen(!mobileOpen)}
        className="md:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-[#1F1F1F] border border-[#303030] text-[#F5F5F5]"
        aria-label="Toggle Sidebar"
      >
        <Menu className="w-4 h-4" />
      </button>

      {mobileOpen && (
        <div
          className="md:hidden fixed inset-0 bg-black/60 z-30"
          onClick={() => setMobileOpen(false)}
        />
      )}

      <aside
        className={`fixed md:static inset-y-0 left-0 z-40 w-[320px] md:w-[350px] bg-[#151515] border-r border-[#242424] flex flex-col h-screen shrink-0 select-none transition-transform duration-200 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'
        }`}
      >
        {/* Top Desktop Header Bar (Reference Image 2 style) */}
        <div className="px-4 pt-4 pb-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-[#EF6464]/90 inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#E9A23B]/90 inline-block" />
              <span className="w-3 h-3 rounded-full bg-[#36C99A]/90 inline-block" />
            </div>
            <div
              onClick={() => navigate('/')}
              className="flex items-center gap-2 ml-1 cursor-pointer"
            >
              <AnavyaLogo className="w-6 h-6" />
              <span className="font-semibold text-[15px] tracking-tight text-[#F5F5F5]">
                Anavya
              </span>
            </div>
          </div>
          <button
            onClick={handleNewConversation}
            title="New Conversation"
            className="p-1.5 rounded-lg text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#242424] transition"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        {/* Search Conversations Input */}
        <div className="px-3.5 mb-2.5">
          <div className="relative flex items-center">
            <Search className="w-3.5 h-3.5 text-[#787878] absolute left-3 pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search"
              className="w-full bg-[#222222] text-xs text-[#F5F5F5] placeholder-[#787878] pl-8 pr-3 py-2 rounded-lg border border-transparent focus:border-[#383838] focus:outline-none transition"
            />
          </div>
        </div>

        {/* Navigation: Chat | Plugins | Agents | History */}
        <div className="px-3.5 pb-2.5 grid grid-cols-4 gap-1.5 border-b border-[#222222]">
          <NavLink
            to="/"
            end
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 rounded-xl text-[11px] transition ${
                isActive
                  ? 'bg-[#262626] text-[#F5F5F5] font-medium shadow-sm'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#1E1E1E]'
              }`
            }
          >
            <MessageSquare className="w-3.5 h-3.5 mb-1" />
            <span>Chat</span>
          </NavLink>

          <NavLink
            to="/plugins"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `relative flex flex-col items-center justify-center py-2 rounded-xl text-[11px] transition ${
                isActive || location.pathname === '/integrations'
                  ? 'bg-[#262626] text-[#F5F5F5] font-medium shadow-sm'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#1E1E1E]'
              }`
            }
          >
            <Blocks className="w-3.5 h-3.5 mb-1" />
            <span>Plugins</span>
            {connectedCount > 0 && (
              <span className="absolute top-1.5 right-2.5 w-1.5 h-1.5 rounded-full bg-[#36C99A]" />
            )}
          </NavLink>

          <NavLink
            to="/agents"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 rounded-xl text-[11px] transition ${
                isActive
                  ? 'bg-[#262626] text-[#F5F5F5] font-medium shadow-sm'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#1E1E1E]'
              }`
            }
          >
            <Bot className="w-3.5 h-3.5 mb-1" />
            <span>Agents</span>
          </NavLink>

          <NavLink
            to="/history"
            onClick={() => setMobileOpen(false)}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center py-2 rounded-xl text-[11px] transition ${
                isActive
                  ? 'bg-[#262626] text-[#F5F5F5] font-medium shadow-sm'
                  : 'text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#1E1E1E]'
              }`
            }
          >
            <History className="w-3.5 h-3.5 mb-1" />
            <span>History</span>
          </NavLink>
        </div>

        {/* Recent Conversations List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-2.5 space-y-1">
          {conversations.length === 0 ? (
            <div className="px-3 py-10 text-center">
              <p className="text-xs text-[#A0A0A0]">No conversations yet.</p>
              <button
                onClick={handleNewConversation}
                className="mt-3 px-3.5 py-1.5 rounded-lg bg-[#262626] hover:bg-[#303030] text-xs text-[#F5F5F5] transition"
              >
                + Start New Objective
              </button>
            </div>
          ) : (
            conversations.map((conv) => {
              const isSelected =
                conv.id === activeConversationId && location.pathname === '/';
              return (
                <div
                  key={conv.id}
                  onClick={() => handleSelectConversation(conv.id)}
                  className={`group flex items-center gap-3 px-3 py-2.5 rounded-xl cursor-pointer transition ${
                    isSelected
                      ? 'bg-[#262626] text-[#F5F5F5]'
                      : 'hover:bg-[#1E1E1E] text-[#F5F5F5]'
                  }`}
                >
                  <AgentAvatar role={conv.agentRole || 'coordinator'} size="md" />

                  <div className="flex-1 min-w-0">
                    {editingId === conv.id ? (
                      <div
                        className="flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <input
                          type="text"
                          value={editTitle}
                          onChange={(e) => setEditTitle(e.target.value)}
                          className="w-full bg-[#171717] text-xs text-[#F5F5F5] px-2 py-1 rounded border border-[#383838] focus:outline-none"
                          autoFocus
                        />
                        <button
                          onClick={async () => {
                            if (editTitle.trim()) {
                              await renameConversation(conv.id, editTitle.trim());
                            }
                            setEditingId(null);
                          }}
                          className="p-1 text-[#36C99A] hover:bg-[#303030] rounded"
                        >
                          <Check className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="p-1 text-[#A0A0A0] hover:bg-[#303030] rounded"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[13px] font-medium truncate">
                            {conv.title}
                          </span>
                          <span className="text-[11px] text-[#787878] shrink-0">
                            {formatTime(conv.lastActivityAt)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-0.5">
                          <div className="truncate min-w-0">
                            {statusPreview(conv)}
                          </div>
                          <div
                            className="hidden group-hover:flex items-center gap-1 shrink-0"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => {
                                setEditingId(conv.id);
                                setEditTitle(conv.title);
                              }}
                              className="p-1 text-[#A0A0A0] hover:text-[#F5F5F5] rounded"
                              title="Rename"
                            >
                              <Edit3 className="w-3 h-3" />
                            </button>
                            <button
                              onClick={() => deleteConversation(conv.id)}
                              className="p-1 text-[#A0A0A0] hover:text-[#EF6464] rounded"
                              title="Delete"
                            >
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Bottom User Profile & Settings Menu */}
        <div className="p-3 border-t border-[#222222] bg-[#151515] relative">
          {showProfileMenu && (
            <div className="absolute bottom-16 left-3 right-3 bg-[#1E1E1E] border border-[#303030] rounded-xl shadow-xl p-1.5 z-50 space-y-0.5">
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setMobileOpen(false);
                  navigate('/settings?tab=profile');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#E5E5E5] hover:bg-[#2A2A2A] transition text-left"
              >
                <User className="w-3.5 h-3.5 text-[#A0A0A0]" />
                <span>Profile</span>
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setMobileOpen(false);
                  navigate('/settings');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#E5E5E5] hover:bg-[#2A2A2A] transition text-left"
              >
                <Settings className="w-3.5 h-3.5 text-[#A0A0A0]" />
                <span>Settings</span>
              </button>
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  setMobileOpen(false);
                  navigate('/plugins');
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#E5E5E5] hover:bg-[#2A2A2A] transition text-left"
              >
                <Link2 className="w-3.5 h-3.5 text-[#A0A0A0]" />
                <span>Connected Accounts</span>
              </button>
              <div className="border-t border-[#2A2A2A] my-1" />
              <button
                onClick={() => {
                  setShowProfileMenu(false);
                  logout();
                }}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs text-[#EF6464] hover:bg-[#EF6464]/10 transition text-left"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          )}

          <div className="flex items-center justify-between">
            <button
              onClick={() => setShowProfileMenu(!showProfileMenu)}
              className="flex items-center gap-2.5 min-w-0 flex-1 text-left hover:bg-[#1E1E1E] p-1.5 rounded-xl transition"
            >
              <div className="w-7 h-7 rounded-full bg-[#2A2A2A] border border-[#383838] flex items-center justify-center text-[11px] font-semibold text-[#F5F5F5] shrink-0">
                {initials}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-[#F5F5F5] truncate capitalize">
                  {displayName}
                </p>
                <p className="text-[10px] text-[#8E8E8E] truncate">
                  {user?.email || 'Anavya Workspace'}
                </p>
              </div>
            </button>

            <NavLink
              to="/settings"
              onClick={() => setMobileOpen(false)}
              title="Anavya Settings"
              className={({ isActive }) =>
                `p-2 rounded-lg transition shrink-0 ${
                  isActive
                    ? 'bg-[#262626] text-[#F5F5F5]'
                    : 'text-[#A0A0A0] hover:text-[#F5F5F5] hover:bg-[#222222]'
                }`
              }
            >
              <Settings className="w-4 h-4" />
            </NavLink>
          </div>
        </div>
      </aside>
    </>
  );
};
