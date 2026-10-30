import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DB_FILE_PATH = path.resolve(process.cwd(), 'workspace', 'anavya_db.json');

export function createFallbackStore() {
  const store: Record<string, any[]> = {
    user: [],
    agent: [],
    task: [],
    taskStep: [],
    agentExecution: [],
    toolExecution: [],
    memory: [],
    approval: [],
    workspaceFile: [],
    automation: [],
    automationExecution: [],
    chatConversation: [],
    chatMessage: [],
    connectedAccount: [],
    oAuthToken: [],
    telegramConnection: [],
  };

  const isTestEnv = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);

  function loadFromDisk() {
    if (isTestEnv) return;
    try {
      if (fs.existsSync(DB_FILE_PATH)) {
        const raw = fs.readFileSync(DB_FILE_PATH, 'utf-8');
        const parsed = JSON.parse(raw);
        for (const k of Object.keys(store)) {
          if (Array.isArray(parsed[k])) {
            store[k] = parsed[k];
          }
        }
      }
    } catch (_e) {
      // Ignore corrupt/missing file on startup
    }
  }

  function saveToDisk() {
    if (isTestEnv) return;
    try {
      const dir = path.dirname(DB_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(DB_FILE_PATH, JSON.stringify(store, null, 2), 'utf-8');
    } catch (_e) {
      // Ignore disk write errors
    }
  }

  loadFromDisk();

  function matchWhere(item: any, where: any): boolean {
    if (!where) return true;
    for (const [key, val] of Object.entries(where)) {
      if (val === undefined) continue;
      if (key === 'userId_provider' && val && typeof val === 'object') {
        const comp = val as any;
        if (item.userId !== comp.userId || item.provider !== comp.provider) return false;
        continue;
      }
      if (val && typeof val === 'object' && !Array.isArray(val) && !(val instanceof Date)) {
        const cond = val as any;
        if (cond.in && Array.isArray(cond.in)) {
          if (!cond.in.includes(item[key])) return false;
          continue;
        }
        if (cond.contains !== undefined) {
          const target = String(item[key] || '');
          const search = String(cond.contains);
          if (cond.mode === 'insensitive') {
            if (!target.toLowerCase().includes(search.toLowerCase())) return false;
          } else {
            if (!target.includes(search)) return false;
          }
          continue;
        }
        if (cond.endsWith !== undefined) {
          const target = String(item[key] || '');
          if (!target.toLowerCase().endsWith(String(cond.endsWith).toLowerCase())) return false;
          continue;
        }
      }
      if (item[key] !== val) return false;
    }
    return true;
  }

  function sortItems(items: any[], orderBy?: any): any[] {
    if (!orderBy) return [...items];
    const [field, dir] = Object.entries(orderBy)[0] || [];
    if (!field) return [...items];
    return [...items].sort((a, b) => {
      const av = a[field];
      const bv = b[field];
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return dir === 'desc' ? -cmp : cmp;
    });
  }

  function applySelectOrInclude(modelName: string, item: any, args?: any): any {
    if (!item) return null;
    const cloned = { ...item };

    if (args?.select) {
      const selected: any = {};
      for (const [k, v] of Object.entries(args.select)) {
        if (v) selected[k] = cloned[k];
      }
      return selected;
    }

    if (args?.include) {
      if (modelName === 'chatConversation') {
        if (args.include.messages) {
          let msgs = store.chatMessage.filter((m) => m.conversationId === cloned.id);
          msgs = sortItems(msgs, args.include.messages.orderBy);
          if (args.include.messages.take) {
            msgs = msgs.slice(0, args.include.messages.take);
          }
          cloned.messages = msgs;
        }
        if (args.include.tasks) {
          let tasks = store.task.filter((t) => t.conversationId === cloned.id);
          tasks = sortItems(tasks, args.include.tasks.orderBy);
          cloned.tasks = tasks.map((t) => applySelectOrInclude('task', t, { include: { steps: true, approvals: true } }));
        }
      }
      if (modelName === 'connectedAccount') {
        if (args.include.oauthToken) {
          cloned.oauthToken =
            store.oAuthToken.find((o) => o.connectedAccountId === cloned.id) || null;
        }
      }
      if (modelName === 'task') {
        if (args.include.steps) {
          let steps = store.taskStep.filter((s) => s.taskId === cloned.id);
          steps = sortItems(steps, args.include.steps.orderBy);
          cloned.steps = steps;
        }
        if (args.include.approvals) {
          let approvals = store.approval.filter((a) => a.taskId === cloned.id);
          approvals = sortItems(approvals, args.include.approvals.orderBy);
          cloned.approvals = approvals;
        }
      }
      if (modelName === 'approval') {
        if (args.include.task) {
          const t = store.task.find((x) => x.id === cloned.taskId) || null;
          cloned.task = t ? applySelectOrInclude('task', t, args.include.task) : null;
        }
      }
      if (modelName === 'automation') {
        if (args.include.executions) {
          let execs = store.automationExecution.filter((e) => e.automationId === cloned.id);
          execs = sortItems(execs, args.include.executions.orderBy);
          if (args.include.executions.take) {
            execs = execs.slice(0, args.include.executions.take);
          }
          cloned.executions = execs;
        }
      }
      if (modelName === 'automationExecution') {
        if (args.include.task) {
          const t = store.task.find((x) => x.id === cloned.taskId) || null;
          cloned.task = t ? applySelectOrInclude('task', t, args.include.task) : null;
        }
      }
    }

    return cloned;
  }

  function makeDelegate(modelName: string) {
    return {
      create: async ({ data, include, select }: any) => {
        const now = new Date();
        const record = {
          id: data.id || crypto.randomUUID(),
          createdAt: data.createdAt || now,
          updatedAt: data.updatedAt || now,
          ...(modelName === 'agentExecution' ? { startedAt: data.startedAt || now } : {}),
          ...(modelName === 'agent'
            ? {
                isActive: data.isActive ?? true,
                isSystem: data.isSystem ?? false,
                isDraft: data.isDraft ?? false,
                enabledTools: data.enabledTools || [],
                avatar: data.avatar || 'amber',
                accentColor: data.accentColor || '#E9A23B',
                personality: data.personality || 'Professional',
                category: data.category || 'general',
              }
            : {}),
          ...(modelName === 'task' ? { status: data.status || 'pending' } : {}),
          ...(modelName === 'taskStep' ? { status: data.status || 'pending' } : {}),
          ...(modelName === 'approval' ? { status: data.status || 'pending' } : {}),
          ...(modelName === 'chatConversation' ? { status: data.status || 'idle', agentRole: data.agentRole || 'coordinator' } : {}),
          ...data,
        };
        store[modelName].push(record);
        saveToDisk();
        return applySelectOrInclude(modelName, record, { include, select });
      },
      createMany: async ({ data }: any) => {
        const now = new Date();
        for (const d of data) {
          store[modelName].push({
            id: d.id || crypto.randomUUID(),
            createdAt: now,
            updatedAt: now,
            ...d,
          });
        }
        saveToDisk();
        return { count: data.length };
      },
      upsert: async ({ where, update, create, include, select }: any) => {
        const idx = store[modelName].findIndex((item) => matchWhere(item, where));
        if (idx !== -1) {
          store[modelName][idx] = {
            ...store[modelName][idx],
            ...update,
            updatedAt: new Date(),
          };
          saveToDisk();
          return applySelectOrInclude(modelName, store[modelName][idx], { include, select });
        }
        const now = new Date();
        const record = {
          id: create.id || crypto.randomUUID(),
          createdAt: now,
          updatedAt: now,
          ...create,
        };
        store[modelName].push(record);
        saveToDisk();
        return applySelectOrInclude(modelName, record, { include, select });
      },
      findUnique: async ({ where, include, select }: any) => {
        const found = store[modelName].find((item) => matchWhere(item, where)) || null;
        return applySelectOrInclude(modelName, found, { include, select });
      },
      findFirst: async ({ where, orderBy, include, select }: any = {}) => {
        let matches = store[modelName].filter((item) => matchWhere(item, where));
        matches = sortItems(matches, orderBy);
        const found = matches[0] || null;
        return applySelectOrInclude(modelName, found, { include, select });
      },
      findMany: async ({ where, orderBy, skip, take, include, select }: any = {}) => {
        let matches = store[modelName].filter((item) => matchWhere(item, where));
        matches = sortItems(matches, orderBy);
        if (typeof skip === 'number') matches = matches.slice(skip);
        if (typeof take === 'number') matches = matches.slice(0, take);
        return matches.map((m) => applySelectOrInclude(modelName, m, { include, select }));
      },
      count: async ({ where }: any = {}) => {
        return store[modelName].filter((item) => matchWhere(item, where)).length;
      },
      update: async ({ where, data, include, select }: any) => {
        const idx = store[modelName].findIndex((item) => matchWhere(item, where));
        if (idx === -1) throw new Error(`${modelName} record not found for update`);
        store[modelName][idx] = {
          ...store[modelName][idx],
          ...data,
          updatedAt: new Date(),
        };
        saveToDisk();
        return applySelectOrInclude(modelName, store[modelName][idx], { include, select });
      },
      updateMany: async ({ where, data }: any) => {
        let count = 0;
        store[modelName] = store[modelName].map((item) => {
          if (matchWhere(item, where)) {
            count += 1;
            return { ...item, ...data, updatedAt: new Date() };
          }
          return item;
        });
        saveToDisk();
        return { count };
      },
      delete: async ({ where }: any) => {
        const idx = store[modelName].findIndex((item) => matchWhere(item, where));
        if (idx === -1) throw new Error(`${modelName} record not found for delete`);
        const [removed] = store[modelName].splice(idx, 1);
        saveToDisk();
        return removed;
      },
      deleteMany: async ({ where }: any = {}) => {
        const before = store[modelName].length;
        store[modelName] = store[modelName].filter((item) => !matchWhere(item, where));
        saveToDisk();
        return { count: before - store[modelName].length };
      },
    };
  }

  return {
    store,
    reset() {
      for (const k of Object.keys(store)) {
        store[k] = [];
      }
    },
    client: {
      user: makeDelegate('user'),
      agent: makeDelegate('agent'),
      task: makeDelegate('task'),
      taskStep: makeDelegate('taskStep'),
      agentExecution: makeDelegate('agentExecution'),
      toolExecution: makeDelegate('toolExecution'),
      memory: makeDelegate('memory'),
      approval: makeDelegate('approval'),
      workspaceFile: makeDelegate('workspaceFile'),
      automation: makeDelegate('automation'),
      automationExecution: makeDelegate('automationExecution'),
      chatConversation: makeDelegate('chatConversation'),
      chatMessage: makeDelegate('chatMessage'),
      connectedAccount: makeDelegate('connectedAccount'),
      oAuthToken: makeDelegate('oAuthToken'),
      telegramConnection: makeDelegate('telegramConnection'),
    },
  };
}

const fallbackInstance = createFallbackStore();

function initPrismaClient(): any {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  const hasExternalPostgres =
    dbUrl.startsWith('postgres') &&
    !dbUrl.includes('localhost:5432') &&
    !dbUrl.includes('127.0.0.1:5432');

  if (hasExternalPostgres || process.env.USE_POSTGRES === 'true') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PrismaModule = require('@prisma/client');
      if (PrismaModule && PrismaModule.PrismaClient) {
        return new PrismaModule.PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        });
      }
    } catch (_err) {
      // Fallback to built-in JSON store if Prisma client is not generated
    }
  }
  return fallbackInstance.client;
}

export function resetFallbackStore(): void {
  fallbackInstance.reset();
}

export const prisma: any = initPrismaClient();
