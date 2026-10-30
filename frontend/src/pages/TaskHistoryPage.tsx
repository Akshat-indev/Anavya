import React, { useState, useEffect } from 'react';
import {
  CheckCircle2,
  Clock,
  AlertCircle,
  ExternalLink,
  Download,
  FileText,
  XCircle,
} from 'lucide-react';
import { api, API_BASE_URL } from '../api/client';
import { AgentAvatar } from '../components/Sidebar';
import { ApplicationIcon } from '../components/BrandIcons';

export const TaskHistoryPage: React.FC = () => {
  const [tasks, setTasks] = useState<any[]>([]);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  const [executions, setExecutions] = useState<any | null>(null);

  const loadTasks = async () => {
    const res = await api.get('/tasks');
    const items = res.data.data.items || [];
    setTasks(items);
    if (!selectedTask && items.length > 0) {
      handleSelectTask(items[0]);
    }
  };

  useEffect(() => {
    loadTasks();
  }, []);

  const handleSelectTask = async (task: any) => {
    setSelectedTask(task);
    try {
      const res = await api.get(`/tasks/${task.id}/executions`);
      setExecutions(res.data.data);
    } catch (_e) {
      setExecutions(null);
    }
  };

  const handleCancelTask = async (taskId: string) => {
    await api.post(`/tasks/${taskId}/cancel`);
    await loadTasks();
  };

  return (
    <div className="flex-1 h-screen overflow-y-auto bg-[#202020] p-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl font-semibold text-[#F5F5F5]">
            Task & Execution History
          </h1>
          <p className="text-xs text-[#A0A0A0] mt-1">
            Inspect full execution traces, Coordinator plans, Specialist Agent steps, deterministic Tool results, and generated artifacts.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Tasks List */}
          <div className="space-y-2.5">
            {tasks.length === 0 ? (
              <div className="p-6 rounded-2xl bg-[#262626] border border-[#323232] text-center text-xs text-[#A0A0A0]">
                No tasks executed yet. Send an objective in Chat to begin.
              </div>
            ) : (
              tasks.map((t) => (
                <div
                  key={t.id}
                  onClick={() => handleSelectTask(t)}
                  className={`p-4 rounded-2xl border cursor-pointer transition ${
                    selectedTask?.id === t.id
                      ? 'bg-[#2B2B2B] border-[#E9A23B]/60'
                      : 'bg-[#252525] border-[#323232] hover:bg-[#2A2A2A]'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1.5">
                    <span className="text-xs font-semibold text-[#F5F5F5] truncate">
                      {t.title}
                    </span>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                        t.status === 'completed'
                          ? 'bg-[#1F352C] text-[#36C99A]'
                          : t.status === 'waiting_for_approval'
                          ? 'bg-[#E9A23B]/15 text-[#E9A23B]'
                          : t.status === 'failed'
                          ? 'bg-[#EF6464]/15 text-[#EF6464]'
                          : 'bg-[#303030] text-[#A0A0A0]'
                      }`}
                    >
                      {t.status}
                    </span>
                  </div>
                  <p className="text-xs text-[#A0A0A0] line-clamp-2">
                    {t.description}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-[10px] text-[#787878]">
                    <span>{t.steps?.length || 0} step(s)</span>
                    <span>{new Date(t.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Right Execution Audit Detail */}
          <div className="lg:col-span-2 space-y-4">
            {selectedTask ? (
              <div className="bg-[#262626] border border-[#333333] rounded-2xl p-6 space-y-5">
                <div className="flex items-start justify-between gap-4 border-b border-[#323232] pb-4">
                  <div>
                    <h2 className="text-sm font-semibold text-[#F5F5F5]">
                      {selectedTask.title}
                    </h2>
                    <p className="text-xs text-[#A0A0A0] mt-1">
                      {selectedTask.description}
                    </p>
                  </div>
                  {(selectedTask.status === 'running' ||
                    selectedTask.status === 'waiting_for_approval') && (
                    <button
                      onClick={() => handleCancelTask(selectedTask.id)}
                      className="px-3 py-1.5 rounded-lg bg-[#2A1C1C] hover:bg-[#EF6464]/20 text-xs text-[#EF6464] flex items-center gap-1 shrink-0"
                    >
                      <XCircle className="w-3.5 h-3.5" /> Cancel Task
                    </button>
                  )}
                </div>

                {/* Steps */}
                <div className="space-y-2.5">
                  <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A0A0A0]">
                    Execution Steps ({selectedTask.steps?.length || 0})
                  </h3>
                  {(selectedTask.steps || []).map((s: any) => (
                    <div
                      key={s.id}
                      className="p-3.5 rounded-xl bg-[#1E1E1E] border border-[#2E2E2E] space-y-1.5"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <AgentAvatar role={s.agentType} size="sm" />
                          <span className="text-xs font-semibold text-[#F5F5F5] uppercase">
                            Step {s.sequence}: {s.agentType}
                          </span>
                        </div>
                        <span className="text-[11px] text-[#36C99A]">
                          {s.status}
                        </span>
                      </div>
                      <p className="text-xs text-[#A0A0A0]">{s.description}</p>
                    </div>
                  ))}
                </div>

                {/* Tool Executions */}
                {executions?.toolExecutions?.length > 0 && (
                  <div className="space-y-2.5">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A0A0A0]">
                      Registered Tool Executions (
                      {executions.toolExecutions.length})
                    </h3>
                    {executions.toolExecutions.map((te: any) => (
                      <div
                        key={te.id}
                        className="p-3 rounded-xl bg-[#1C1C1C] border border-[#2E2E2E] text-xs space-y-1"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <ApplicationIcon appOrTool={te.toolName} className="w-4 h-4" />
                            <span className="font-mono text-[#E9A23B]">
                              {te.toolName}
                            </span>
                          </div>
                          <span className="text-[11px] text-[#36C99A]">
                            {te.status}
                          </span>
                        </div>
                        <pre className="text-[11px] text-[#A0A0A0] overflow-x-auto max-h-36">
                          {JSON.stringify(te.output, null, 2)}
                        </pre>
                      </div>
                    ))}
                  </div>
                )}

                {/* Generated Artifacts */}
                {selectedTask.finalOutput?.artifacts?.length > 0 && (
                  <div className="space-y-2">
                    <h3 className="text-xs font-semibold uppercase tracking-wider text-[#A0A0A0]">
                      Generated Artifacts
                    </h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedTask.finalOutput.artifacts.map(
                        (art: any, idx: number) => {
                          const isExternal = Boolean(art.externalUrl);
                          const href = isExternal
                            ? art.externalUrl
                            : `${API_BASE_URL.replace('/api/v1', '')}${art.downloadUrl}`;
                          return (
                            <a
                              key={idx}
                              href={href}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-[#1C1C1C] hover:bg-[#303030] border border-[#383838] text-xs text-[#F5F5F5]"
                            >
                              <FileText className="w-3.5 h-3.5 text-[#E9A23B]" />
                              <span>{art.filename}</span>
                              {isExternal ? (
                                <ExternalLink className="w-3 h-3 text-[#A0A0A0]" />
                              ) : (
                                <Download className="w-3 h-3 text-[#A0A0A0]" />
                              )}
                            </a>
                          );
                        }
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="bg-[#262626] border border-[#333333] rounded-2xl p-8 text-center text-xs text-[#A0A0A0]">
                Select a task on the left to inspect its execution trace.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

