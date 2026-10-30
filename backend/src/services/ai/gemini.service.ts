import { GoogleGenAI } from '@google/genai';
import { ZodSchema } from 'zod';
import { env } from '../../config/env';
import { AppError } from '../../utils/errors';
import { ExecutionPlan, AgentExecutionContext } from '../../types';
import { executionPlanSchema } from '../../schemas';

const SUPPORTED_GEMINI_MODELS = [
  'gemini-3.8-flash',
  'gemini-3.7-flash',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.5-flash-lite',
  'gemini-3.1-flash-lite',
  'gemini-flash-latest',
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
  'gemini-2.5-pro',
  'gemini-2.0-flash',
  'gemini-2.0-flash-lite',
  'gemini-1.5-flash',
];

const SENSITIVE_PATTERNS = [
  /password\s*[:=]\s*\S+/gi,
  /api[_-]?key\s*[:=]\s*\S+/gi,
  /secret\s*[:=]\s*\S+/gi,
  /bearer\s+[a-zA-Z0-9\-._~+/]+=*/gi,
];

export class GeminiService {
  private client: GoogleGenAI | null = null;
  private modelName: string;

  constructor() {
    this.modelName = env.GEMINI_MODEL || 'gemini-3.5-flash-lite';
    if (
      env.GEMINI_API_KEY &&
      env.GEMINI_API_KEY.trim() !== '' &&
      env.GEMINI_API_KEY !== 'your_google_ai_studio_api_key'
    ) {
      this.client = new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
    }
  }

  public isMockMode(): boolean {
    if (
      process.env.VITEST === 'true' ||
      process.env.NODE_ENV === 'test' ||
      env.NODE_ENV === 'test'
    ) {
      return true;
    }
    if (env.AI_MOCK_MODE) {
      return true;
    }
    return !this.client;
  }

  public getConfiguredModel(): string {
    return this.modelName;
  }

  public validateConfiguration(): void {
    if (!SUPPORTED_GEMINI_MODELS.includes(this.modelName)) {
      throw new AppError(
        `Configured GEMINI_MODEL '${this.modelName}' is not in the supported Gemini free-tier model list (${SUPPORTED_GEMINI_MODELS.join(', ')}). Refusing to silently switch to a paid model.`,
        500,
        'INVALID_GEMINI_MODEL'
      );
    }

    if (!this.client && !env.AI_MOCK_MODE) {
      throw new AppError(
        'GEMINI_API_KEY is missing and AI_MOCK_MODE is false. Please configure a valid Google AI Studio API key or enable AI_MOCK_MODE=true for development.',
        503,
        'GEMINI_API_KEY_MISSING'
      );
    }
  }

  public sanitizeInput(text: string): string {
    let sanitized = text;
    for (const pattern of SENSITIVE_PATTERNS) {
      sanitized = sanitized.replace(pattern, '[REDACTED_SENSITIVE]');
    }
    return sanitized;
  }

  private async callGeminiWithTimeout(
    prompt: string,
    systemInstruction?: string,
    maxOutputTokens = 2048,
    responseMimeType?: string,
    timeoutMs = 60000
  ): Promise<string> {
    this.validateConfiguration();

    if (!this.client) {
      throw new AppError('Gemini client is not initialized', 503, 'GEMINI_UNAVAILABLE');
    }

    const cleanPrompt = this.sanitizeInput(prompt);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await Promise.race([
        this.client.models.generateContent({
          model: this.modelName,
          contents: cleanPrompt,
          config: {
            systemInstruction: systemInstruction
              ? this.sanitizeInput(systemInstruction)
              : undefined,
            maxOutputTokens,
            temperature: 0.2,
            ...(responseMimeType ? { responseMimeType } : {}),
          },
        }),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () =>
            reject(new AppError('Gemini API request timed out', 504, 'GEMINI_TIMEOUT'))
          );
        }),
      ]);

      const text = response.text;
      if (!text) {
        throw new AppError('Gemini returned an empty response', 502, 'GEMINI_EMPTY_RESPONSE');
      }
      return text;
    } catch (err: any) {
      if (err instanceof AppError) {
        throw err;
      }
      const message = err?.message || String(err);
      if (
        message.includes('429') ||
        message.toLowerCase().includes('quota') ||
        message.toLowerCase().includes('rate limit') ||
        message.toLowerCase().includes('resource_exhausted')
      ) {
        throw new AppError(
          'Google Gemini API free-tier quota or rate limit reached. Current task state has been preserved. Please retry later.',
          429,
          'GEMINI_QUOTA_EXCEEDED'
        );
      }
      if (message.includes('404') || message.toLowerCase().includes('not found')) {
        throw new AppError(
          `Configured Gemini model '${this.modelName}' is unavailable for your account or API version.`,
          400,
          'GEMINI_MODEL_UNAVAILABLE'
        );
      }
      throw new AppError(`Gemini API error: ${message}`, 502, 'GEMINI_API_ERROR');
    } finally {
      clearTimeout(timeout);
    }
  }

  public async generateResponse(
    prompt: string,
    systemInstruction?: string,
    maxOutputTokens = 1500
  ): Promise<{ text: string; aiMode: 'gemini' | 'mock' }> {
    this.validateConfiguration();

    if (this.isMockMode()) {
      return {
        text: `[MOCK DEVELOPMENT MODE - NOT GENUINE GEMINI OUTPUT]\nProcessed prompt: ${this.sanitizeInput(prompt).slice(0, 300)}`,
        aiMode: 'mock',
      };
    }

    const text = await this.callGeminiWithTimeout(prompt, systemInstruction, maxOutputTokens);
    return { text, aiMode: 'gemini' };
  }

  public async generateStructuredResponse<T>(
    prompt: string,
    schema: ZodSchema<T>,
    systemInstruction?: string,
    maxOutputTokens = 2048
  ): Promise<{ data: T; aiMode: 'gemini' | 'mock' }> {
    this.validateConfiguration();

    const rawText = await this.callGeminiWithTimeout(
      prompt,
      systemInstruction,
      maxOutputTokens,
      'application/json'
    );

    const cleanedJson = rawText
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/```\s*$/i, '')
      .trim();

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(cleanedJson);
    } catch (_e) {
      throw new AppError('Gemini response was not valid JSON', 502, 'GEMINI_INVALID_JSON');
    }

    const validated = schema.safeParse(parsedJson);
    if (!validated.success) {
      throw new AppError(
        `Gemini structured output failed schema validation: ${validated.error.message}`,
        502,
        'GEMINI_SCHEMA_VALIDATION_ERROR'
      );
    }

    return { data: validated.data, aiMode: 'gemini' };
  }

  public async generateTaskPlan(
    objective: string,
    workspaceFiles: Array<{ id: string; filename: string; mimeType: string }>,
    memories: Array<{ category: string; content: string }>,
    integrationStatus?: {
      googleConnected: boolean;
      telegramConnected: boolean;
      spreadsheetId?: string;
    }
  ): Promise<{ plan: ExecutionPlan; aiMode: 'gemini' | 'mock' }> {
    this.validateConfiguration();

    const lower = objective.toLowerCase();
    const wantsGoogleDrive =
      lower.includes('google drive') ||
      lower.includes('drive file') ||
      lower.includes('find my') ||
      lower.includes('search drive');
    const wantsGoogleSheets =
      lower.includes('google sheet') ||
      (lower.includes('spreadsheet') && integrationStatus?.googleConnected);
    const wantsDocumentCreation =
      /\b(create|make|write|generate)\b[\s\S]{0,40}\b(doc|document)\b/.test(lower);
    const wantsGoogleDocs = lower.includes('google doc') || wantsDocumentCreation;
    const wantsCreativeWriting =
      /\b(write|compose|create|make|generate)\b[\s\S]{0,30}\b(poem|poetry|story|essay|letter|lyrics|script)\b/.test(
        lower
      );
    const wantsGmail =
      lower.includes('gmail') ||
      (lower.includes('email') && integrationStatus?.googleConnected);
    const wantsTelegram = lower.includes('telegram');

    // Deterministic multi-tool orchestration plan ONLY in mock/test mode
    if (this.isMockMode()) {
      const steps: any[] = [];
      let seq = 1;

      const csvFile = workspaceFiles.find(
        (f) => f.filename.toLowerCase().endsWith('.csv') || f.mimeType.includes('csv')
      );

      // Extract spreadsheetId if mentioned in objective or provided
      const idMatch = objective.match(/spreadsheetId[:=\s]+([a-zA-Z0-9-_]+)/i);
      const sheetId = idMatch?.[1] || integrationStatus?.spreadsheetId || 'primary_sales_sheet';

      if (wantsGoogleDrive && !wantsGoogleSheets) {
        steps.push({
          sequence: seq++,
          agentType: 'researcher',
          description: 'Search Google Drive for relevant files and spreadsheets',
          requiredTools: ['google_drive.search_files'],
          toolArguments: { query: objective },
        });
      }

      if (lower.includes('show me my available spreadsheets') || lower.includes('list spreadsheets')) {
        steps.push({
          sequence: seq++,
          agentType: 'analyst',
          description: 'List accessible spreadsheets from connected Google Workspace account',
          requiredTools: ['google_sheets.list_spreadsheets'],
          toolArguments: {},
        });
      } else if (wantsGoogleSheets) {
        steps.push({
          sequence: seq++,
          agentType: 'analyst',
          description: 'Read sales spreadsheet from Google Sheets and perform deterministic revenue and product analysis',
          requiredTools: ['google_sheets.read'],
          toolArguments: {
            spreadsheetId: sheetId,
            range: 'Sheet1!A1:F250',
          },
        });
      } else if (lower.includes('csv') || lower.includes('sales') || lower.includes('spreadsheet') || lower.includes('analyze') || csvFile) {
        const targetFile = csvFile ? csvFile.filename : 'sample_sales.csv';
        steps.push({
          sequence: seq++,
          agentType: 'analyst',
          description: `Run deterministic CSV Analyzer on ${targetFile} and calculate total revenue, top 5 products, and category comparisons`,
          requiredTools: ['csv_analyzer'],
          toolArguments: { filename: targetFile, topN: 5 },
        });
      }

      if (wantsGoogleDocs) {
        const simpleDocumentRequest =
          /\b(random|list|names?)\b/.test(lower) &&
          !/\b(report|summary|analysis|executive|professional|formal)\b/.test(lower);
        steps.push({
          sequence: seq++,
          agentType: 'writer',
          description: simpleDocumentRequest
            ? 'Create a simple document containing only the requested names'
            : 'Generate a professional sales performance report and create a Google Doc in the connected Google Workspace',
          requiredTools: ['google_docs.create_document'],
          toolArguments: {
            title: simpleDocumentRequest ? 'Names' : 'Sales Performance & Top Products Report',
          },
        });
      } else if (wantsCreativeWriting) {
        steps.push({
          sequence: seq++,
          agentType: 'writer',
          description: 'Create the requested creative writing in the requested format and length',
          requiredTools: [],
          toolArguments: {},
        });
      } else if (
        steps.length > 0 &&
        (lower.includes('report') || lower.includes('document') || lower.includes('summary')) &&
        !lower.includes('email')
      ) {
        steps.push({
          sequence: seq++,
          agentType: 'writer',
          description: 'Generate a professional Markdown report from the Analyst findings and save it to the workspace',
          requiredTools: ['file_writer'],
          toolArguments: { filename: 'sales_analysis_report.md', fileType: 'md' },
        });
      }

      if (wantsTelegram) {
        steps.push({
          sequence: seq++,
          agentType: 'writer',
          description: 'Prepare Telegram notification with report summary and link, and request human approval before sending',
          requiredTools: ['telegram.send_message'],
          toolArguments: {
            text: 'Your sales analysis report is ready.',
          },
        });
      } else if (wantsGmail) {
        const emailMatch = objective.match(/([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})/);
        const recipient = emailMatch?.[1] || 'client@example.com';
        if (lower.includes('draft') && !lower.includes('send')) {
          steps.push({
            sequence: seq++,
            agentType: 'writer',
            description: `Create a Gmail draft to ${recipient} with the executive summary`,
            requiredTools: ['gmail.create_draft'],
            toolArguments: {
              recipient,
              subject: 'Anavya Executive Summary Report',
            },
          });
        } else if (lower.includes('read') || lower.includes('search') || lower.includes('inbox')) {
          steps.push({
            sequence: seq++,
            agentType: 'researcher',
            description: 'Search and summarize relevant messages from Gmail inbox',
            requiredTools: ['gmail.list_messages'],
            toolArguments: { maxResults: 5 },
          });
        } else {
          steps.push({
            sequence: seq++,
            agentType: 'writer',
            description: `Prepare Gmail message to ${recipient} and request human approval before sending`,
            requiredTools: ['gmail.send_message'],
            toolArguments: {
              recipient,
              subject: 'Anavya Executive Summary Report',
            },
          });
        }
      } else if (
        lower.includes('email') ||
        lower.includes('send ') ||
        lower.includes('publish') ||
        lower.includes('client')
      ) {
        if (steps.length === 0) {
          steps.push({
            sequence: seq++,
            agentType: 'writer',
            description: 'Draft email summary based on recent findings or report context',
            requiredTools: [],
          });
        }
        steps.push({
          sequence: seq++,
          agentType: 'writer',
          description: 'Submit email action for human approval before sending to client',
          requiredTools: ['approval_protected_action'],
          toolArguments: {
            actionType: 'send_email',
            recipient: 'client@example.com',
            subject: 'Executive Summary Report',
          },
        });
      }

      if (steps.length === 0) {
        if (lower.includes('code') || lower.includes('implement') || lower.includes('bug') || lower.includes('technical')) {
          steps.push({
            sequence: 1,
            agentType: 'developer',
            description: 'Analyze technical requirements, create architecture plan and code snippets, and save technical documentation',
            requiredTools: ['file_writer'],
            toolArguments: { filename: 'technical_specification.md', fileType: 'md' },
          });
        } else {
          steps.push(
            {
              sequence: 1,
              agentType: 'researcher',
              description: 'Conduct topic research and compile structured findings',
              requiredTools: ['web_research'],
              toolArguments: { query: objective },
            },
            {
              sequence: 2,
              agentType: 'writer',
              description: 'Compile findings into a structured Markdown report in the user workspace',
              requiredTools: ['file_writer'],
              toolArguments: { filename: 'research_report.md', fileType: 'md' },
            }
          );
        }
      }

      const plan: ExecutionPlan = {
        objectiveSummary: `${this.isMockMode() ? '[MOCK] ' : ''}Execute autonomous workflow for: ${objective}`,
        workType: wantsTelegram || lower.includes('email') ? 'approval_action' : 'mixed',
        steps,
      };

      return {
        plan: executionPlanSchema.parse(plan) as ExecutionPlan,
        aiMode: this.isMockMode() ? 'mock' : 'gemini',
      };
    }

    const systemPrompt = `You are the Coordinator Agent for Anavya, an autonomous AI workspace.
Create a concise, valid JSON execution plan (maximum 8 steps) to fulfill the user's objective.
Available specialist agentType values: "researcher", "analyst", "writer", "developer".
Available registered tools (ONLY use tool names from this exact list):
- "web_research": internet search (arguments: { "query": "string" })
- "file_reader": read workspace file (arguments: { "filename": "string" })
- "file_writer": write report/artifact to workspace (arguments: { "filename": "string", "fileType": "md" | "txt" | "json" | "csv" })
- "csv_analyzer": deterministic CSV analysis for totals, averages, top-N rankings (arguments: { "filename": "string", "topN": 5 })
- "google_drive.list_files": list files in Google Drive (arguments: {})
- "google_drive.search_files": search Google Drive files (arguments: { "query": "string" })
- "google_drive.upload_file": create or upload a file in Google Drive (arguments: { "filename": "string", "content": "string" })
- "google_sheets.create_spreadsheet": create a brand new Google Sheet / Excel spreadsheet with table rows (arguments: { "title": "string", "values": [["Col1", "Col2"], ["Val1", "Val2"]] })
- "google_sheets.list_spreadsheets": list Google Sheets (arguments: {})
- "google_sheets.read": read Google Sheet range (arguments: { "spreadsheetId": "string", "range": "Sheet1!A1:F100" })
- "google_sheets.append_rows": add/append rows to an existing Google Sheet (arguments: { "spreadsheetId": "latest", "range": "Sheet1!A1", "values": [["Val1", "Val2"]] })
- "google_sheets.update_range": edit/update cells in an existing Google Sheet (arguments: { "spreadsheetId": "latest", "range": "Sheet1!A1:B2", "values": [["Val1", "Val2"]] })
- "google_docs.create_document": create a Google Doc with title and content (arguments: { "title": "string", "content": "string" })
- "google_docs.update_content": edit/update an existing Google Doc (arguments: { "documentId": "string", "content": "string" })
- "gmail.list_messages": list recent Gmail messages (arguments: { "maxResults": 10 })
- "gmail.search_messages": search Gmail messages (arguments: { "query": "string" })
- "gmail.create_draft": create a Gmail draft without sending (arguments: { "recipient": "string", "subject": "string", "body": "string" })
- "gmail.send_message": send an email via Gmail after human approval — ALWAYS include a real, specific "recipient", "subject", and complete well-written "body" matching the user's request! (arguments: { "recipient": "string", "subject": "string", "body": "string" })
- "telegram.send_message": send a Telegram message after approval (arguments: { "text": "string" })
- "approval_protected_action": required when sending emails if Gmail is not connected (arguments: { "actionType": "send_email", "recipient": "string", "subject": "string", "bodyDraft": "string" })

Rules:
1. If the user asks to send an email (or mentions an email address like foo@gmail.com), use "gmail.send_message" with agentType "writer", and write the actual email subject and full email body in toolArguments!
2. If the user asks to create an Excel / spreadsheet / Google Sheet, use "google_sheets.create_spreadsheet" with agentType "analyst" or "writer", and include realistic header + data rows in toolArguments.values!
3. If the user asks to edit/update a spreadsheet, use "google_sheets.append_rows" or "google_sheets.update_range".
4. If the user asks to create a Google Doc or write a document in Drive, use "google_docs.create_document" or "google_drive.upload_file" with agentType "writer".
5. Match the requested complexity and format exactly. For a poem, story, essay, letter, lyrics, or other creative request, return only the requested creative work unless the user asks for explanation or metadata. For a simple document request, create only the requested content. Do not add an executive summary, date, author, identifiers, classification, administrative notes, fabricated metadata, or next steps unless explicitly requested.

Return strictly JSON matching this schema:
{
  "objectiveSummary": "string",
  "workType": "research" | "data_analysis" | "report_generation" | "development" | "approval_action" | "mixed",
  "steps": [
    {
      "sequence": 1,
      "agentType": "researcher" | "analyst" | "writer" | "developer",
      "description": "string",
      "requiredTools": ["string"],
      "toolArguments": {}
    }
  ]
}`;

    const userPrompt = `Objective: ${objective}
Available Workspace Files: ${JSON.stringify(workspaceFiles)}
Connected Integrations: ${JSON.stringify(integrationStatus || {})}
Relevant User Memories: ${JSON.stringify(memories)}`;

    const { data, aiMode } = await this.generateStructuredResponse(
      userPrompt,
      executionPlanSchema as any,
      systemPrompt,
      2048
    );

    return { plan: data as ExecutionPlan, aiMode };
  }

  public async generateEmailDraft(
    objective: string,
    recipient: string,
    previousSummary?: string
  ): Promise<{ subject: string; body: string }> {
    if (this.isMockMode()) {
      return {
        subject: 'Anavya Executive Summary Report',
        body: previousSummary || 'Your executive analysis report is ready in Anavya.',
      };
    }

    try {
      const prompt = `Write a complete, polished, ready-to-send email that fulfills this exact user request:
User Request: "${objective}"
Recipient: ${recipient}
${previousSummary ? `Additional Context / Findings from previous steps:\n${previousSummary}\n` : ''}

Return strictly valid JSON with two keys:
{
  "subject": "Clear, engaging, specific subject line for this email",
  "body": "The full, well-formatted plain-text email body (do not use placeholder brackets like [Your Name] if you can sign off naturally or use the sender's context)"
}`;
      const raw = await this.callGeminiWithTimeout(
        prompt,
        'You are the Writer Agent for Anavya. Write authentic, complete, high-quality emails tailored to the user prompt.',
        1200,
        'application/json'
      );
      const parsed = JSON.parse(
        raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()
      );
      if (parsed?.subject && parsed?.body) {
        return {
          subject: String(parsed.subject).trim(),
          body: String(parsed.body).trim(),
        };
      }
    } catch (_e) {
      // Fallback below
    }

    const fallbackRes = await this.generateResponse(
      `Write the complete email body for: ${objective}${previousSummary ? `\nContext: ${previousSummary}` : ''}`,
      'Write only the email body text, ready to send.',
      1000
    );
    return {
      subject: objective.slice(0, 70),
      body: fallbackRes.text,
    };
  }

  public async generateSpreadsheetTable(
    objective: string,
    previousSummary?: string
  ): Promise<{ title: string; values: Array<Array<string | number>> }> {
    if (this.isMockMode()) {
      return {
        title: 'Anavya Generated Sheet',
        values: [
          ['Item', 'Category', 'Value'],
          ['Sample 1', 'General', 100],
        ],
      };
    }

    try {
      const prompt = `Create a structured spreadsheet table (headers in row 1, followed by at least 5 realistic data rows) that fulfills this user request:
User Request: "${objective}"
${previousSummary ? `Context / Findings:\n${previousSummary}\n` : ''}

Return strictly valid JSON matching this format:
{
  "title": "Short descriptive spreadsheet title",
  "values": [
    ["Column 1", "Column 2", "Column 3", "Column 4"],
    ["Row 1 Col 1", "Row 1 Col 2", 100, "Notes"]
  ]
}`;
      const raw = await this.callGeminiWithTimeout(
        prompt,
        'You are the Analyst Agent for Anavya. Generate accurate, structured spreadsheet tables.',
        1500,
        'application/json'
      );
      const parsed = JSON.parse(
        raw
          .replace(/^```json\s*/i, '')
          .replace(/^```\s*/i, '')
          .replace(/```\s*$/i, '')
          .trim()
      );
      if (parsed?.title && Array.isArray(parsed?.values) && parsed.values.length > 0) {
        return {
          title: String(parsed.title).trim(),
          values: parsed.values,
        };
      }
    } catch (_e) {
      // Fallback
    }

    return {
      title: objective.slice(0, 50) || 'Anavya Spreadsheet',
      values: [
        ['Name', 'Category', 'Details', 'Status'],
        ['Item 1', 'Primary', objective.slice(0, 60), 'Active'],
      ],
    };
  }

  public async executeAgentPrompt(
    agentRole: string,
    systemInstructions: string,
    context: AgentExecutionContext
  ): Promise<{ text: string; aiMode: 'gemini' | 'mock' }> {
    this.validateConfiguration();

    if (this.isMockMode()) {
      return {
        text: this.buildMockAgentOutput(agentRole, context),
        aiMode: 'mock',
      };
    }

    const compactPrompt = `Task Objective: ${context.objective}
Assigned Step: ${context.stepDescription}
User Memories / Preferences: ${JSON.stringify(context.memories)}
Previous Agent Outputs: ${JSON.stringify(context.previousOutputs)}
Deterministic Tool Outputs: ${JSON.stringify(context.toolResults)}

Provide the requested output for your role (${agentRole}). Match the user's requested format, tone, and complexity exactly. Do not wrap creative writing or simple content in a report template, and do not invent metadata or unrequested sections. Do not invent fake sources. Rely on the deterministic tool outputs provided.`;

    return this.generateResponse(compactPrompt, systemInstructions, 2048);
  }

  public async generateTaskSummary(
    objective: string,
    stepOutputs: Array<{ agentType: string; summary: string }>,
    artifacts: Array<{ filename: string; fileId: string; externalUrl?: string }>
  ): Promise<{ summary: string; aiMode: 'gemini' | 'mock' }> {
    this.validateConfiguration();

    if (this.isMockMode()) {
      const artifactList =
        artifacts.length > 0
          ? artifacts.map((a) => (a.externalUrl ? `${a.filename} (${a.externalUrl})` : a.filename)).join(', ')
          : 'None';
      const agentSummary = stepOutputs
        .map((s) => `${s.agentType.toUpperCase()}: ${s.summary.slice(0, 140)}`)
        .join(' | ');
      return {
        summary: `Your task "${objective}" is complete. ${agentSummary}. Artifacts: ${artifactList}.`,
        aiMode: 'mock',
      };
    }

    const prompt = `Summarize the completed task concisely (3-5 sentences) for persistent memory and final conversation output. Include any Google Docs URLs or artifact names if present.
Objective: ${objective}
Agent Outputs: ${JSON.stringify(stepOutputs)}
Generated Artifacts: ${JSON.stringify(artifacts)}`;

    const res = await this.generateResponse(
      prompt,
      'You are the Coordinator Agent summarizing a completed multi-agent workflow.',
      600
    );
    return { summary: res.text, aiMode: res.aiMode };
  }

  private buildMockAgentOutput(agentRole: string, context: AgentExecutionContext): string {
    const csvToolResult =
      context.toolResults.find((t) => t.toolName === 'csv_analyzer')?.output ||
      context.toolResults.find((t) => t.toolName === 'google_sheets.read')?.output?.analysis;
    const prevAnalyst = context.previousOutputs.find((p) => p.agentType === 'analyst')?.output;

    if (agentRole === 'analyst' && csvToolResult) {
      const totalRev =
        csvToolResult.GrandTotalRevenue ?? csvToolResult.numericSummaries?.revenue?.sum ?? 0;
      const topProducts = csvToolResult.topProductsByRevenue || [];
      const topList = topProducts
        .map(
          (p: any, idx: number) =>
            `${idx + 1}. **${p.product}** — Revenue: $${Number(p.totalRevenue).toFixed(2)} (Quantity: ${p.totalQuantity}, Share: ${p.revenueSharePercent}%)`
        )
        .join('\n');

      return `[MOCK DEVELOPMENT MODE - DETERMINISTIC CSV ANALYSIS INTERPRETATION]
### Analyst Key Findings
- **Dataset Overview**: ${csvToolResult.rowCount} rows and ${csvToolResult.columnCount} columns (${(csvToolResult.columns || []).join(', ')}).
- **Total Revenue**: **$${Number(totalRev).toFixed(2)}**
- **Average Revenue per Transaction**: $${Number(csvToolResult.numericSummaries?.revenue?.average ?? 0).toFixed(2)}

### Top 5 Performing Products
${topList || 'No product breakdown available.'}

### Category & Performance Observations
- Category breakdown: ${JSON.stringify(csvToolResult.categoryBreakdown || {})}
- Missing values detected: ${csvToolResult.missingValuesCount ?? 0}`;
    }

    if (agentRole === 'writer') {
      const analysisData =
        prevAnalyst?.findings?.toolResults?.find((t: any) => t.toolName === 'csv_analyzer')?.output ||
        prevAnalyst?.findings?.toolResults?.find((t: any) => t.toolName === 'google_sheets.read')?.output?.analysis ||
        prevAnalyst?.toolResults?.find((t: any) => t.toolName === 'csv_analyzer')?.output ||
        csvToolResult;

      if (
        context.objective.toLowerCase().includes('email') ||
        context.stepDescription.toLowerCase().includes('email')
      ) {
        return `[MOCK DEVELOPMENT MODE - EMAIL DRAFT]
Subject: Executive Summary: Sales & Performance Report
To: client@example.com

Dear Client,

Please find below the executive summary of our latest analysis:
${prevAnalyst?.summary || context.memories.map((m) => m.content).join('\n') || 'Key performance indicators and product comparisons have been compiled into the workspace report.'}

Best regards,
Anavya Autonomous Workspace`;
      }

      if (analysisData) {
        const totalRev =
          analysisData.GrandTotalRevenue ?? analysisData.numericSummaries?.revenue?.sum ?? 0;
        const topProducts = analysisData.topProductsByRevenue || [];
        const rowsMd = topProducts
          .map(
            (p: any, i: number) =>
              `| ${i + 1} | ${p.product} | ${p.category || 'N/A'} | ${p.totalQuantity} | $${Number(p.totalRevenue).toFixed(2)} | ${p.revenueSharePercent}% |`
          )
          .join('\n');

        const categoryEntries = Object.entries(analysisData.categoryBreakdown || {})
          .map(([cat, rev]) => `- **${cat}**: $${Number(rev).toFixed(2)}`)
          .join('\n');

        return `# Sales Performance & Product Comparison Report
> *Notice: Generated in Mock Development Mode using real deterministic CSV Analyzer calculations.*

## 1. Executive Summary
This report provides a comprehensive analysis of the sales dataset comprising **${analysisData.rowCount} records** across **${analysisData.columnCount} columns**. The deterministic analysis engine calculated a grand total revenue of **$${Number(totalRev).toFixed(2)}**.

## 2. Total Revenue & Core Metrics
- **Total Revenue**: **$${Number(totalRev).toFixed(2)}**
- **Total Units Sold**: **${analysisData.numericSummaries?.quantity?.sum ?? 'N/A'}**
- **Average Transaction Revenue**: **$${Number(analysisData.numericSummaries?.revenue?.average ?? 0).toFixed(2)}**
- **Min / Max Transaction Revenue**: $${Number(analysisData.numericSummaries?.revenue?.min ?? 0).toFixed(2)} / $${Number(analysisData.numericSummaries?.revenue?.max ?? 0).toFixed(2)}

## 3. Top Five Products by Revenue
| Rank | Product | Category | Units Sold | Total Revenue | Revenue Share |
| :--- | :--- | :--- | :--- | :--- | :--- |
${rowsMd}

## 4. Product & Category Comparisons
${categoryEntries || '- All products analyzed across primary categories.'}

### Analyst Interpretation
${prevAnalyst?.summary || 'Top products drive the majority of revenue volume with consistent unit pricing.'}

## 5. Useful Observations
1. **Revenue Concentration**: The top 5 products account for a strong majority of total sales revenue.
2. **Data Integrity**: Missing values across all rows: ${analysisData.missingValuesCount ?? 0}.
3. **User Preferences Applied**: ${context.memories.length > 0 ? context.memories.map((m) => m.content).join('; ') : 'Standard executive formatting.'}

## 6. Conclusion
Focusing inventory and marketing resources on the top-performing products identified above will maximize revenue growth while maintaining strong category balance.
`;
      }

      return `# Task Report: ${context.objective}
> *Notice: Generated in Mock Development Mode.*

## Summary
${context.previousOutputs.map((p) => `### ${p.agentType.toUpperCase()}\n${JSON.stringify(p.output?.summary || p.output)}`).join('\n\n') || 'Completed report generation based on task context.'}
`;
    }

    if (agentRole === 'researcher') {
      const researchTool = context.toolResults.find((t) => t.toolName === 'web_research')?.output;
      return `[MOCK DEVELOPMENT MODE - RESEARCHER OUTPUT]
Objective: ${context.objective}
Web Research Tool Status: ${researchTool ? JSON.stringify(researchTool) : 'No live external search executed.'}`;
    }

    return `[MOCK DEVELOPMENT MODE - ${agentRole.toUpperCase()} AGENT]
Executed step: ${context.stepDescription} for objective: "${context.objective}".`;
  }
}

export const geminiService = new GeminiService();
