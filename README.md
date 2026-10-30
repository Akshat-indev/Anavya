# Anavya — Autonomous AI Workspace

> **"Your AI workspace. Your agents. Your work, done."**

Anavya is a chat-first autonomous AI workspace where users give natural-language objectives, connect real external applications (**Google Drive**, **Google Docs**, **Google Sheets**, **Gmail**, and **Telegram**), customize specialist AI agents in a full **Agent Configuration Studio**, and have those agents execute real multi-step workflows with human-in-the-loop approval gates.

---

## 1. Key Capabilities

### Chat-First Autonomous Workspace
- **Desktop-First Minimal Interface**: 350px left sidebar with conversation search, `Chat`, `Plugins`, `Agents`, and `History` navigation, live status previews (`Running workflow...`, `Waiting for approval`, `Done.`), and bottom user profile & settings menu.
- **Application-Identifiable Execution Cards**: Every tool execution card in chat displays the official brand SVG icon and application name (`Google Sheets`, `Google Docs`, `Google Drive`, `Gmail`, `Telegram`), the action being performed, status badge (`Queued`, `Running`, `Waiting for approval`, `Completed`, `Failed`, `Cancelled`), result summary, and an expandable technical payload inspector.
- **Human-in-the-Loop Approval Cards**: Sensitive external actions (`gmail.send_message`, `telegram.send_message`, `google_sheets.append_rows`, `google_sheets.update_range`) pause execution and render an interactive approval card in chat supporting **Approve and Send**, **Edit Draft** (inline recipient/subject/body editor), and **Reject**.

### Full Agent Configuration Studio (`/agents`)
Create custom agents or customize the 5 core specialist agents (`Coordinator`, `Researcher`, `Analyst`, `Writer`, `Developer`) across **Sections A–K**:
- **A & B. Basic Identity & Role**: Name, description, specialist role, category, avatar, short intro, and accent color.
- **C & D. Personality & System Instructions**: Selectable personalities (`Professional`, `Friendly`, `Concise`, `Analytical`, `Creative`, `Formal`, `Technical`, `Custom`) + large system instruction editor with financial analyst template loader.
- **E. Expandable Tool Permissions**: Granular tool checkboxes per integration (`Google Sheets`, `Google Docs`, `Google Drive`, `Gmail`, `Telegram`).
- **F. Action Permissions**: Enforceable toggles (`allowReadOnly`, `allowDocCreation`, `allowSheetModification`, `allowEmailDrafting`, `allowEmailSending`, `allowTelegramMessaging`, `requireApproval`).
- **G. Execution Behaviour**: Max steps, max retries, timeout duration, delegation, approval enforcement, collaboration, and memory persistence.
- **H & I. Output Preferences & Memory Settings**: Response length, output format, tone, citations, and memory controls.
- **J. Live Test Agent Sandbox**: Enter a sample instruction to test any agent configuration live against the backend (`POST /api/v1/agents/test`), inspecting the agent's response, selected tools, and permission warnings.
- **K. Save & Manage**: Save Agent, Save as Draft, Duplicate, Enable/Disable, and Delete custom agents (while protecting core system agents).

### Plugins Directory Marketplace (`/plugins`)
- Search and filter plugins across `All`, `Productivity`, `Communication`, `Documents`, `Data and Analytics`, and `Development`.
- Clear `INSTALLED` and `AVAILABLE` sections with official SVG icons for **Google Drive**, **Google Docs**, **Google Sheets**, **Gmail**, and **Telegram**.
- **Plugin Details Modal**: Shows available actions, what Anavya can access, what Anavya can modify, what actions require approval, privacy guarantees, connection controls, and interactive live tool sandboxes.

---

## 2. Repository Structure

```text
BuildToShipHackathon/
├── backend/                  # Express + TypeScript + Prisma + Gemini + Google/Telegram APIs
│   ├── prisma/schema.prisma  # Database schema (Users, Agents, Conversations, Tasks, Approvals, etc.)
│   ├── src/
│   │   ├── controllers/      # REST API controllers
│   │   ├── services/
│   │   │   ├── ai/           # Google Gemini (@google/genai) free-tier service
│   │   │   ├── agents/       # Specialist Agent execution & Studio Test runner
│   │   │   ├── approvals/    # Human-in-the-loop approval & Edit Draft engine
│   │   │   ├── integrations/ # Google Drive, Docs, Sheets, Gmail & Telegram services
│   │   │   ├── orchestration/# Multi-agent Coordinator & step orchestrator
│   │   │   └── tools/        # Registered deterministic & external API tools
│   └── tests/api.test.ts     # Comprehensive Vitest integration test suite
├── frontend/                 # React 19 + TypeScript + Tailwind CSS + Zustand
│   └── src/
│       ├── components/       # Sidebar, BrandIcons (official SVGs)
│       └── pages/            # ChatWorkspace, PluginsPage, AgentsPage, SettingsPage, TaskHistoryPage
└── README.md
```

---

## 3. Quick Start

### 1. Start the Backend (`http://localhost:4000`)
```bash
cd backend
npm install
npm run dev
```
- Swagger API Documentation: `http://localhost:4000/api-docs`
- Health Check: `http://localhost:4000/api/v1/health`

### 2. Start the Frontend (`http://localhost:5173`)
```bash
cd frontend
npm install
npm run dev
```

### 3. Run Automated Tests
```bash
cd backend
npm test
```
