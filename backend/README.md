# TaskForce AI — Backend MVP
## Autonomous AI Teammate Workspace

TaskForce AI is an autonomous AI teammate workspace backend built with **Node.js, TypeScript, Express, Prisma (Supabase PostgreSQL), and the official Google Gemini Developer API (`@google/genai`)**.

Instead of acting as a passive chatbot, TaskForce AI understands natural-language objectives, creates validated multi-step execution plans via a **Coordinator Agent**, delegates subtasks to **Specialist Agents**, executes allowlisted backend tools (including a deterministic **CSV Analyzer**), shares structured findings across agents, pauses for **Human-in-the-Loop Approvals** on protected actions, stores **User-Scoped Persistent Memory**, and saves generated Markdown reports in a secure **User Workspace**.

---

## 1. System Architecture

```text
TaskForce-AI/
├── backend/
│   ├── src/
│   │   ├── config/          # Environment validation (Zod), Prisma DB client, OpenAPI/Swagger spec
│   │   ├── controllers/     # Thin REST controllers (auth, agents, tasks, approvals, memory, workspace, automations, system)
│   │   ├── routes/          # Express v1 router (/api/v1/*)
│   │   ├── middleware/      # JWT authentication, Zod request validation, centralized error handler
│   │   ├── schemas/         # Zod validation schemas for requests, plans, and tool inputs
│   │   ├── types/           # TypeScript domain interfaces
│   │   ├── utils/           # Standardized API responses and operational AppError class
│   │   ├── services/
│   │   │   ├── ai/          # Google Gemini API (@google/genai) wrapper + Free-Tier safeguards
│   │   │   ├── agents/      # 5 Specialist Agents (Coordinator, Researcher, Analyst, Writer, Developer)
│   │   │   ├── orchestration/ # Sequential task planning & execution engine
│   │   │   ├── tools/       # Allowlisted Tool Registry & deterministic CSV Analyzer
│   │   │   ├── memory/      # User-scoped PostgreSQL persistent memory service
│   │   │   ├── approvals/   # Human-in-the-loop pause/approve/reject workflow engine
│   │   │   ├── automations/ # Reusable workflow definitions (includes Sales Report Automation)
│   │   │   └── workspace/   # Local user-scoped file storage with path traversal protection
│   │   ├── app.ts           # Express app setup (Helmet, CORS, Rate Limiting, Swagger UI)
│   │   └── server.ts        # HTTP Server entrypoint
│   ├── prisma/
│   │   └── schema.prisma    # Complete 11-model PostgreSQL schema
│   ├── samples/
│   │   └── sample_sales.csv # Sample dataset for the mandatory Sales CSV Demo Workflow
│   ├── workspace/
│   │   └── users/           # Isolated per-user file storage: backend/workspace/users/{userId}/
│   ├── tests/
│   │   ├── api.test.ts      # 18 comprehensive integration & E2E tests (Vitest + Supertest)
│   │   └── prisma-mock.ts   # Deterministic relational store mock for zero-quota automated tests
│   ├── .env.example
│   ├── package.json
│   ├── tsconfig.json
│   └── README.md
└── README.md
```

---

## 2. Specialist Agent Responsibilities

1. **Coordinator Agent (`coordinator`)**:
   - The sole orchestrator of the task lifecycle.
   - Retrieves relevant user memories and workspace file metadata.
   - Calls Google Gemini to generate a structured JSON execution plan (validated with Zod, max 8 steps).
   - Delegates steps sequentially to specialist agents, collects outputs, persists progress after every step, and generates the final task summary.
2. **Researcher Agent (`researcher`)**:
   - Executes research steps using the `web_research` or `file_reader` tools.
   - Never fabricates URLs or sources.
3. **Analyst Agent (`analyst`)**:
   - Executes deterministic data analysis via the `csv_analyzer` tool (exact JavaScript math for totals, averages, min/max, top-N product rankings, category breakdowns, and missing-value detection) and uses Gemini to interpret trends and comparisons.
4. **Writer Agent (`writer`)**:
   - Synthesizes outputs from previous agents (Researcher/Analyst) and user formatting preferences from Memory.
   - Generates professional Markdown reports (`file_writer`) or email drafts (`approval_protected_action`).
5. **Developer Agent (`developer`)**:
   - Analyzes technical requirements, produces architecture plans and code artifacts, and saves technical documentation to the user workspace.

---

## 3. Orchestration Workflow

1. User submits a natural-language objective via `POST /api/v1/tasks`.
2. Backend creates a `Task` record (`status: pending` → `planning`).
3. Coordinator retrieves relevant user memories (`MemoryService`) and workspace file metadata (`WorkspaceService`).
4. Coordinator generates a structured plan via `GeminiService.generateTaskPlan()` and validates it with `executionPlanSchema` (Zod).
5. `TaskStep` records are persisted (`status: pending`), and task transitions to `running`.
6. Each step is delegated sequentially to its assigned Specialist Agent (`AgentExecution` recorded).
7. Agents invoke allowlisted tools ONLY through `ToolRegistryService` (`ToolExecution` recorded).
8. Actual findings and tool outputs are passed into the context of subsequent steps.
9. If a step invokes `approval_protected_action`, an `Approval` record (`status: pending`) is created and the task pauses (`status: waiting_for_approval`) until the authenticated user calls `POST /api/v1/approvals/:id/approve` or `/reject`.
10. When all steps complete, the Coordinator generates a task summary, stores it in persistent memory (`category: task_summary`), and marks the task `completed`.

---

## 4. Google Gemini API Setup & Free-Tier Optimization

- **SDK**: Uses the official `@google/genai` SDK exclusively. No OpenAI, Anthropic, xAI, or paid model fallbacks are used.
- **Configuration**:
  ```env
  GEMINI_API_KEY=your_google_ai_studio_api_key
  GEMINI_MODEL=gemini-2.5-flash
  AI_MOCK_MODE=false
  ```
- **Free-Tier Safeguards**:
  - Configurable free-tier model validation (`gemini-2.5-flash` default).
  - Strict `maxOutputTokens` limits and 25-second request timeouts (`AbortController`).
  - Maximum 8 steps per task and at most 1 retry on transient errors.
  - Rate-limit (`429` / `RESOURCE_EXHAUSTED`) errors are **never retried in a loop**; task state is preserved and a clear `GEMINI_QUOTA_EXCEEDED` error is returned so the user can retry later.
  - Deterministic calculations (CSV sums, averages, top-5 rankings) are performed in TypeScript rather than wasting Gemini tokens.
  - **Privacy Notice**: Sensitive patterns (`password=`, `api_key=`, `secret=`, Bearer tokens) are automatically redacted before prompts are sent to Gemini. Note that the Google Gemini free tier has different data-use terms from paid tiers; avoid uploading confidential production PII.
  - **Mock Development Mode**: If `GEMINI_API_KEY` is omitted and `AI_MOCK_MODE=true`, the service operates in a clearly labeled `[MOCK DEVELOPMENT MODE]` for local testing without pretending to be live Gemini output.

---

## 5. Database Setup & Prisma Migrations

1. Provision a **Supabase PostgreSQL** (or local PostgreSQL) database and copy its connection string into `backend/.env` as `DATABASE_URL`.
2. Generate the Prisma Client and run migrations:
   ```bash
   cd backend
   npm run prisma:generate
   npm run prisma:migrate
   ```

---

## 6. Environment Variables

Create `backend/.env` from `backend/.env.example`:

| Variable | Description | Default |
| :--- | :--- | :--- |
| `PORT` | HTTP server port | `5000` |
| `NODE_ENV` | `development` \| `production` \| `test` | `development` |
| `FRONTEND_URL` | Allowed CORS origin | `http://localhost:5173` |
| `DATABASE_URL` | PostgreSQL connection URL | Required |
| `JWT_SECRET` | Secret key for signing JWTs (min 16 chars) | Required |
| `JWT_EXPIRES_IN` | JWT expiration window | `7d` |
| `GEMINI_API_KEY` | Google AI Studio API Key | Optional if `AI_MOCK_MODE=true` |
| `GEMINI_MODEL` | Gemini model identifier | `gemini-2.5-flash` |
| `WORKSPACE_ROOT` | Local workspace directory | `./workspace` |
| `MAX_UPLOAD_SIZE_MB` | Maximum upload file size in MB | `10` |
| `AI_MOCK_MODE` | Enable labeled mock mode when key is absent | `false` |

---

## 7. Installation, Running & Testing

```bash
cd backend

# 1. Install dependencies
npm install

# 2. Generate Prisma Client & run DB migrations (requires active PostgreSQL in DATABASE_URL)
npm run prisma:generate
npm run prisma:migrate

# 3. Start development server with hot reload
npm run dev

# 4. Build TypeScript for production
npm run build
npm start

# 5. Run automated test suite (Vitest + Supertest)
npm test
```

- **Swagger UI Documentation**: `http://localhost:5000/api-docs`
- **OpenAPI JSON Spec**: `http://localhost:5000/api-docs.json`
- **Health Check**: `http://localhost:5000/api/v1/health`

---

## 8. Demo Workflow Instructions

### Demo 1: Mandatory Sales CSV Analysis & Report Generation
1. Register/Login via `POST /api/v1/auth/register` and copy the `token`.
2. Upload `backend/samples/sample_sales.csv` via `POST /api/v1/workspace/upload` (`multipart/form-data`, field `file`).
3. Submit the task via `POST /api/v1/tasks`:
   ```json
   {
     "title": "Q3 Sales Analysis",
     "description": "Analyze this sales CSV. Calculate total revenue, identify the top five products, compare their performance, and generate a professional report."
   }
   ```
4. Inspect the response:
   - `csv_analyzer` deterministically computes `$66,950.00` total revenue across 12 rows and ranks the top 5 products (`Enterprise AI Copilot` #1 at `$16,650.00`).
   - Analyst Agent interprets the metrics.
   - Writer Agent generates `sales_analysis_report.md` and saves it via `file_writer`.
   - Download the generated report via `GET /api/v1/workspace/files/:id/download`.

### Demo 2: Human-in-the-Loop Approval Workflow
1. Submit the task via `POST /api/v1/tasks`:
   ```json
   {
     "title": "Client Email Summary",
     "description": "Prepare an email summarizing this report and send it to the client."
   }
   ```
2. The Writer Agent drafts the email and triggers `approval_protected_action`. The task pauses with `status: "waiting_for_approval"`.
3. View pending approvals via `GET /api/v1/approvals/pending`.
4. Approve via `POST /api/v1/approvals/:id/approve` (records a safe simulated action artifact in the workspace without claiming a real external email was sent, and completes the task) or reject via `POST /api/v1/approvals/:id/reject`.

---

## 9. Current MVP Limitations

- **Task Execution Model**: Tasks run sequentially within a persisted request workflow (max 8 steps). Background queue workers (e.g., BullMQ/Redis) are intentionally omitted per MVP modular-monolith guidelines.
- **Web Research Tool**: Live internet search grounding is disabled by default on the free tier so that search results are never fabricated and paid search APIs are never required.
- **Email & External Actions**: Protected actions (`send_email`, `publish_content`) create explicit human-approved simulated action records in the workspace rather than sending live external emails.
- **Storage**: Uses local user-scoped filesystem storage (`backend/workspace/users/{userId}/`) with path-traversal protection; designed so `WorkspaceService` can be swapped to Supabase Storage later.

