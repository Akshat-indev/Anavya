import { create } from 'zustand';
import { api } from '../api/client';

export interface UserProfile {
  id: string;
  email: string;
  createdAt?: string;
}

export interface ConversationItem {
  id: string;
  title: string;
  agentRole: string;
  status: string;
  lastMessagePreview: string;
  lastActivityAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessageItem {
  id: string;
  conversationId: string;
  senderType: 'user' | 'agent' | 'system' | 'tool' | 'approval';
  senderName?: string;
  agentRole?: string;
  content: string;
  toolExecutionId?: string;
  approvalId?: string;
  attachmentId?: string;
  metadata?: Record<string, any>;
  createdAt: string;
}

export interface IntegrationState {
  google: {
    connected: boolean;
    oauthConfiguredOnServer?: boolean;
    accountEmail?: string;
    accountName?: string;
    scopes?: string[];
    lastConnectedAt?: string;
  };
  telegram: {
    connected: boolean;
    botUsername?: string | null;
    botFirstName?: string | null;
    linkedChatId?: string | null;
    linkedChatTitle?: string | null;
    lastConnectedAt?: string;
  };
}

interface WorkspaceStore {
  user: UserProfile | null;
  token: string | null;
  conversations: ConversationItem[];
  activeConversationId: string | null;
  messages: ChatMessageItem[];
  activeTasks: any[];
  integrations: IntegrationState;
  workspaceFiles: any[];
  isSending: boolean;
  liveBanner: string | null;
  chatError: string | null;

  setAuth: (user: UserProfile, token: string) => void;
  logout: () => void;
  fetchConversations: (search?: string) => Promise<void>;
  selectConversation: (id: string) => Promise<void>;
  createConversation: (title?: string, agentRole?: string) => Promise<string>;
  renameConversation: (id: string, title: string) => Promise<void>;
  deleteConversation: (id: string) => Promise<void>;
  sendMessage: (content: string, opts?: { attachmentId?: string; spreadsheetId?: string }) => Promise<void>;
  resolveApproval: (
    approvalId: string,
    decision: 'approve' | 'reject',
    reason?: string,
    editedDraft?: {
      recipient?: string;
      subject?: string;
      bodyDraft?: string;
      text?: string;
    }
  ) => Promise<void>;
  fetchIntegrations: () => Promise<void>;
  fetchWorkspaceFiles: () => Promise<void>;
  setLiveBanner: (banner: string | null) => void;
  appendMessageIfMissing: (msg: ChatMessageItem) => void;
}

export const useWorkspaceStore = create<WorkspaceStore>((set, get) => ({
  user: JSON.parse(localStorage.getItem('taskforce_user') || 'null'),
  token: localStorage.getItem('taskforce_jwt') || null,
  conversations: [],
  activeConversationId: null,
  messages: [],
  activeTasks: [],
  integrations: {
    google: { connected: false },
    telegram: { connected: false },
  },
  workspaceFiles: [],
  isSending: false,
  liveBanner: null,
  chatError: null,

  setAuth: (user, token) => {
    localStorage.setItem('taskforce_jwt', token);
    localStorage.setItem('taskforce_user', JSON.stringify(user));
    set({ user, token });
  },

  logout: () => {
    localStorage.removeItem('taskforce_jwt');
    localStorage.removeItem('taskforce_user');
    set({
      user: null,
      token: null,
      conversations: [],
      activeConversationId: null,
      messages: [],
      activeTasks: [],
    });
  },

  setLiveBanner: (banner) => set({ liveBanner: banner }),

  appendMessageIfMissing: (msg) => {
    const { activeConversationId, messages } = get();
    if (msg.conversationId !== activeConversationId) return;
    if (messages.some((m) => m.id === msg.id)) return;
    set({ messages: [...messages, msg] });
  },

  fetchConversations: async (search) => {
    const res = await api.get('/chat/conversations', {
      params: search ? { search } : undefined,
    });
    const list: ConversationItem[] = res.data.data.conversations || [];
    set({ conversations: list });
  },

  selectConversation: async (id) => {
    set({ activeConversationId: id });
    const res = await api.get(`/chat/conversations/${id}`);
    if (get().activeConversationId !== id) return;
    const conv = res.data.data.conversation;
    set({
      messages: conv.messages || [],
      activeTasks: conv.tasks || [],
    });
  },

  createConversation: async (title, agentRole = 'coordinator') => {
    const res = await api.post('/chat/conversations', { title, agentRole });
    const conv = res.data.data.conversation;
    await get().fetchConversations();
    await get().selectConversation(conv.id);
    return conv.id;
  },

  renameConversation: async (id, title) => {
    await api.patch(`/chat/conversations/${id}`, { title });
    await get().fetchConversations();
    if (get().activeConversationId === id) {
      await get().selectConversation(id);
    }
  },

  deleteConversation: async (id) => {
    await api.delete(`/chat/conversations/${id}`);
    const currentId = get().activeConversationId;
    await get().fetchConversations();
    const remaining = get().conversations;
    if (currentId === id) {
      if (remaining.length > 0) {
        await get().selectConversation(remaining[0].id);
      } else {
        set({ activeConversationId: null, messages: [], activeTasks: [] });
      }
    }
  },

  sendMessage: async (content, opts) => {
    let convId = get().activeConversationId;
    if (!convId) {
      convId = await get().createConversation(content.slice(0, 42));
    }

    // Optimistically show user message right away
    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: ChatMessageItem = {
      id: tempId,
      conversationId: convId,
      senderType: 'user',
      senderName: 'User',
      content,
      createdAt: new Date().toISOString(),
    };

    set({
      isSending: true,
      chatError: null,
      liveBanner: 'Working on your request...',
      messages: [...get().messages, optimisticMsg],
    });

    try {
      const res = await api.post(`/chat/conversations/${convId}/messages`, {
        content,
        attachmentId: opts?.attachmentId,
        spreadsheetId: opts?.spreadsheetId,
      });

      const updatedConv = res.data.data.conversation;
      set({
        messages: updatedConv.messages || [],
        activeTasks: updatedConv.tasks || [],
      });
      await get().fetchConversations();
    } catch (err: any) {
      const message =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'The message could not be processed. Please try again.';
      set((state) => ({
        messages: state.messages.filter((messageItem) => messageItem.id !== tempId),
        chatError: message,
      }));
      await get().selectConversation(convId);
    } finally {
      set({ isSending: false, liveBanner: null });
    }
  },

  resolveApproval: async (approvalId, decision, reason, editedDraft) => {
    set({
      isSending: true,
      liveBanner:
        decision === 'approve'
          ? 'Executing approved action & resuming autonomous workflow...'
          : 'Rejecting action & cancelling workflow...',
    });
    try {
      await api.post(`/approvals/${approvalId}/${decision}`, {
        reason: reason || (decision === 'approve' ? 'Approved in chat' : 'Rejected in chat'),
        ...(editedDraft ? { editedDraft } : {}),
      });
      const convId = get().activeConversationId;
      if (convId) {
        await get().selectConversation(convId);
      }
      await get().fetchConversations();
    } catch (err: any) {
      const msg =
        err?.response?.data?.error?.message ||
        err?.response?.data?.message ||
        err?.message ||
        'Approval failed';
      if (typeof window !== 'undefined') {
        window.alert(`Could not complete action: ${msg}`);
      }
    } finally {
      const convId = get().activeConversationId;
      if (convId) {
        await get().selectConversation(convId);
      }
      set({ isSending: false, liveBanner: null });
    }
  },

  fetchIntegrations: async () => {
    try {
      const [gRes, tRes] = await Promise.all([
        api.get('/integrations/google/status'),
        api.get('/integrations/telegram/status'),
      ]);
      set({
        integrations: {
          google: gRes.data.data,
          telegram: tRes.data.data,
        },
      });
    } catch (_e) {
      // Ignore if unauthenticated
    }
  },

  fetchWorkspaceFiles: async () => {
    try {
      const res = await api.get('/workspace/files');
      set({ workspaceFiles: res.data.data.files || [] });
    } catch (_e) {
      // Ignore
    }
  },
}));
