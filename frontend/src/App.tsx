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
