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
    scheduledTask: [],
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
    const dir = path.dirname(DB_FILE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const tempPath = `${DB_FILE_PATH}.tmp`;
    fs.writeFileSync(tempPath, JSON.stringify(store, null, 2), 'utf-8');
    fs.renameSync(tempPath, DB_FILE_PATH);
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
        const toMs = (x: any) => (x instanceof Date ? x.getTime() : new Date(x).getTime());
        if (cond.lte !== undefined || cond.lt !== undefined || cond.gte !== undefined || cond.gt !== undefined) {
          const cur = item[key];
          if (cur === null || cur === undefined) return false;
          const c = typeof cur === 'number' ? cur : toMs(cur);
          const cv = (x: any) => (typeof cur === 'number' ? x : toMs(x));
          if (cond.lte !== undefined && !(c <= cv(cond.lte))) return false;
          if (cond.lt !== undefined && !(c < cv(cond.lt))) return false;
          if (cond.gte !== undefined && !(c >= cv(cond.gte))) return false;
          if (cond.gt !== undefined && !(c > cv(cond.gt))) return false;
          continue;
        }
        if (cond.not !== undefined) {
          if (item[key] === cond.not) return false;
          continue;
        }
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
    const orders = Array.isArray(orderBy) ? orderBy : [orderBy];
    return [...items].sort((a, b) => {
      for (const order of orders) {
        const [field, dir] = Object.entries(order)[0] || [];
        if (!field) continue;
        const av = a[field];
        const bv = b[field];
        if (av === bv) continue;
        const cmp = av > bv ? 1 : -1;
        return dir === 'desc' ? -cmp : cmp;
      }
      return 0;
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
      scheduledTask: makeDelegate('scheduledTask'),
      $transaction: async (callback: (client: any) => Promise<any>) => {
        const snapshot = JSON.parse(JSON.stringify(store));
        try {
          return await callback((fallbackInstance as any).client);
        } catch (error) {
          for (const key of Object.keys(store)) {
            store[key] = snapshot[key];
          }
          saveToDisk();
          throw error;
        }
      },
    },
  };
}

const fallbackInstance = createFallbackStore();


export type StorageMode = 'postgres' | 'file';

const RETRYABLE_PRISMA_CODES = new Set(['P1001', 'P1002', 'P1008', 'P1017', 'P2024']);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

let storageMode: StorageMode = 'file';
let storageWarning: string | null = null;

export function getStorageInfo(): { mode: StorageMode; durable: boolean; warning: string | null } {
  return { mode: storageMode, durable: storageMode === 'postgres', warning: storageWarning };
}

function initPrismaClient(): any {
  const dbUrl = (process.env.DATABASE_URL || '').trim();
  const isProd = process.env.NODE_ENV === 'production';
  const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
  const hasPostgresUrl = dbUrl.startsWith('postgres');
  const isLocalPostgres = dbUrl.includes('localhost:5432') || dbUrl.includes('127.0.0.1:5432');
  const wantsPostgres = (hasPostgresUrl && (!isLocalPostgres || isProd)) || process.env.USE_POSTGRES === 'true';

  if (wantsPostgres && !isTest) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const PrismaModule = require('@prisma/client');
      if (PrismaModule && PrismaModule.PrismaClient) {
        const base = new PrismaModule.PrismaClient({
          log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
        });
        // Retry transient connection failures (idle connections dropped by managed Postgres)
        const client = base.$extends({
          query: {
            async $allOperations({ args, query }: any) {
              let lastErr: any;
              for (let attempt = 0; attempt < 4; attempt++) {
                try {
                  return await query(args);
                } catch (err: any) {
                  lastErr = err;
                  const code = err?.code as string | undefined;
                  const isInit = err?.name === 'PrismaClientInitializationError';
                  if (!(isInit || (code && RETRYABLE_PRISMA_CODES.has(code)))) throw err;
                  await sleep(250 * Math.pow(2, attempt));
                }
              }
              throw lastErr;
            },
          },
        });
        storageMode = 'postgres';
        console.log('🗄️  Storage: PostgreSQL (durable)');
        return client;
      }
    } catch (err: any) {
      storageWarning = `Prisma client unavailable (${err?.message || 'unknown'}). Falling back to local file storage.`;
    }
  } else if (!isTest) {
    storageWarning = hasPostgresUrl
      ? 'DATABASE_URL points at localhost; using local file storage.'
      : 'DATABASE_URL is not set; using local file storage.';
  }

  if (isProd && !isTest) {
    storageWarning =
      (storageWarning || 'Postgres not active.') +
      ' Local file storage is EPHEMERAL on hosts like Render: conversations and connections are lost on restart. Set DATABASE_URL.';
    console.error(`STORAGE WARNING: ${storageWarning}`);
  } else if (storageWarning) {
    console.warn(`Storage notice: ${storageWarning}`);
  }
  return fallbackInstance.client;
}

export function resetFallbackStore(): void {
  fallbackInstance.reset();
}

export const prisma: any = initPrismaClient();
