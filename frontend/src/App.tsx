import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { useWorkspaceStore } from './context/useWorkspaceStore';
import { Sidebar } from './components/Sidebar';
import { ChatWorkspace } from './pages/ChatWorkspace';
import { PluginsPage } from './pages/PluginsPage';
import { AgentsPage } from './pages/AgentsPage';
import { TaskHistoryPage } from './pages/TaskHistoryPage';
import { SettingsPage } from './pages/SettingsPage';
import { AuthPage } from './pages/AuthPage';
import { API_BASE_URL } from './api/client';

export const App: React.FC = () => {
  const {
    token,
    fetchConversations,
    fetchIntegrations,
    fetchWorkspaceFiles,
    appendMessageIfMissing,
    setLiveBanner,
    activeConversationId,
    selectConversation,
  } = useWorkspaceStore();

  useEffect(() => {
    if (!token) return;
    fetchConversations();
    fetchIntegrations();
    fetchWorkspaceFiles();

    const sseUrl = `${API_BASE_URL}/events?token=${encodeURIComponent(token)}`;
    const es = new EventSource(sseUrl);

    es.addEventListener('conversation.message.created', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.data?.message) {
          appendMessageIfMissing(payload.data.message);
        }
      } catch (_err) {
        // Ignore parse error
      }
    });

    es.addEventListener('agent.execution.started', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        const role = payload.data?.agentType || 'Specialist';
        setLiveBanner(
          `${role.toUpperCase()} Agent: ${payload.data?.description || 'Executing step...'}`
        );
      } catch (_err) {}
    });

    es.addEventListener('tool.execution.started', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data);
        setLiveBanner(
          `Running tool: ${payload.data?.toolName}...`
        );
      } catch (_err) {}
    });

    es.addEventListener('approval.required', () => {
      setLiveBanner(null);
      if (activeConversationId) {
        selectConversation(activeConversationId);
      }
    });

    es.addEventListener('task.completed', () => {
      setLiveBanner(null);
      fetchConversations();
      if (activeConversationId) {
        selectConversation(activeConversationId);
      }
    });

    es.addEventListener('task.failed', () => {
      setLiveBanner(null);
      fetchConversations();
    });

    return () => {
      es.close();
    };
  }, [token]);

  if (window.location.pathname === '/privacy') {
    return (
      <div className="min-h-screen bg-[#121212] text-[#ECECEC] flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-[#181818] border border-[#262626] rounded-2xl p-8 space-y-4 text-sm leading-relaxed">
          <h1 className="text-xl font-semibold text-white">Privacy Policy — Anavya</h1>
          <p className="text-xs text-[#8E8E93]">Effective Date: October 30, 2026</p>
          <p>
            Anavya provides an autonomous AI workspace. When you sign in with Google or connect Google Workspace / Telegram plugins, we only access the files, documents, spreadsheets, emails, and chat IDs needed to execute the tasks you request.
          </p>
          <p>
            All OAuth tokens are encrypted at rest using AES-256-GCM. We never sell or share your data with third parties, and you can disconnect your account at any time from the Plugins page.
          </p>
          <a href="/" className="inline-block text-xs text-[#E9A23B] hover:underline">← Back to Anavya</a>
        </div>
      </div>
    );
  }

  if (window.location.pathname === '/terms') {
    return (
      <div className="min-h-screen bg-[#121212] text-[#ECECEC] flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-[#181818] border border-[#262626] rounded-2xl p-8 space-y-4 text-sm leading-relaxed">
          <h1 className="text-xl font-semibold text-white">Terms of Service — Anavya</h1>
          <p className="text-xs text-[#8E8E93]">Effective Date: October 30, 2026</p>
          <p>
            By using Anavya, you authorize your configured AI agents to perform actions on connected integrations under your supervision. Sensitive external actions (such as sending emails or modifying spreadsheets) require your explicit approval.
          </p>
          <p>
            You may disconnect integrations or stop using the service at any time.
          </p>
          <a href="/" className="inline-block text-xs text-[#E9A23B] hover:underline">← Back to Anavya</a>
        </div>
      </div>
    );
  }

  if (!token) {
    return <AuthPage />;
  }

  return (
    <BrowserRouter>
      <div className="flex h-screen w-screen overflow-hidden bg-[#171717] text-[#F5F5F5]">
        <Sidebar />
        <Routes>
          <Route path="/" element={<ChatWorkspace />} />
          <Route path="/plugins" element={<PluginsPage />} />
          <Route path="/integrations" element={<PluginsPage />} />
          <Route path="/agents" element={<AgentsPage />} />
          <Route path="/history" element={<TaskHistoryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;
