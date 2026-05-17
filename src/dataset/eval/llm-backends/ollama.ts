// ─── Ollama HTTP Backend ───────────────────────────────────────────────────────
//
// Raw Ollama HTTP adapter (localhost:11434). Primary local backend.
// Uses native fetch (Node 18+) — no extra dependencies.
//
// Supports:
//   callWithTools  — E1 (tool-use): Ollama /api/chat with tools param
//   callStructured — E2 (phrase continuation): Ollama /api/chat format:"json"
//   callPlain      — E3 (MCQ): plain /api/chat, returns text content
//
// Model recommendations for tool-use (E1):
//   - hermes3:8b   — best tool-use support among 8B class
//   - qwen2.5:7b   — solid alternative
//   Models WITHOUT native tool-use support will fail E1 with a clear error.
//
// Cost reporting: $0 (local inference).
// ─────────────────────────────────────────────────────────────────────────────

import type { LlmBackend, ToolSchema, ToolUseResult, CallMeta } from "../llm-runner.js";

// ─── Ollama API types ─────────────────────────────────────────────────────────

interface OllamaMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  tool_calls?: OllamaToolCall[];
}

interface OllamaToolCall {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

interface OllamaTool {
  type: "function";
  function: {
    name: string;
    description?: string;
    parameters: unknown;
  };
}

interface OllamaChatResponse {
  model: string;
  message: OllamaMessage;
  done: boolean;
  prompt_eval_count?: number;
  eval_count?: number;
}

// ─── Backend implementation ───────────────────────────────────────────────────

export class OllamaBackend implements LlmBackend {
  readonly name = "ollama";
  readonly model: string;
  private readonly baseUrl: string;
  private _lastMeta: CallMeta = {
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
  };
  /** Raw text from the most recent callStructured call (for tolerant parsing). */
  private _lastRawText: string | null = null;

  constructor(model: string, baseUrl?: string) {
    this.model = model;
    const raw = baseUrl ?? (process.env.OLLAMA_HOST ?? "http://localhost:11434");
    // Normalize: add http:// scheme if missing (Ollama sets OLLAMA_HOST as host:port)
    this.baseUrl = raw.startsWith("http://") || raw.startsWith("https://")
      ? raw
      : `http://${raw}`;
  }

  private async post(endpoint: string, body: unknown): Promise<unknown> {
    const url = `${this.baseUrl}${endpoint}`;
    let resp: Response;
    const t0 = Date.now();
    try {
      resp = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      throw new Error(
        `Ollama not reachable at ${this.baseUrl}. ` +
          "Run `ollama serve` or set OLLAMA_HOST environment variable.\n" +
          `Underlying error: ${String(err)}`,
      );
    }
    const latencyMs = Date.now() - t0;

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      throw new Error(
        `Ollama returned HTTP ${resp.status}: ${text.slice(0, 200)}`,
      );
    }

    const data = (await resp.json()) as OllamaChatResponse;
    this._lastMeta = {
      promptTokens: data.prompt_eval_count ?? 0,
      completionTokens: data.eval_count ?? 0,
      latencyMs,
      costEstimate: 0, // local — free
    };
    return data;
  }

  async probe(): Promise<void> {
    // Lightweight reachability check — hits /api/tags (no model required)
    const url = `${this.baseUrl}/api/tags`;
    try {
      const resp = await fetch(url, { method: "GET" });
      if (!resp.ok) {
        throw new Error(`HTTP ${resp.status}`);
      }
    } catch (err) {
      throw new Error(
        `Ollama not reachable at ${this.baseUrl}. ` +
          "Run `ollama serve` or set OLLAMA_HOST environment variable.\n" +
          `Underlying error: ${String(err)}`,
      );
    }
  }

  async callWithTools(args: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolSchema[];
  }): Promise<ToolUseResult> {
    const ollamaTools: OllamaTool[] = args.tools.map((t) => ({
      type: "function",
      function: {
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
      },
    }));

    const messages: OllamaMessage[] = [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ];

    const data = (await this.post("/api/chat", {
      model: this.model,
      messages,
      tools: ollamaTools,
      stream: false,
    })) as OllamaChatResponse;

    const toolCalls = data.message.tool_calls ?? [];
    if (toolCalls.length === 0 && !data.message.content) {
      throw new Error(
        `Model ${this.model} returned no tool calls. ` +
          "Ensure you are using a model with native tool-use support (hermes3:8b, qwen2.5:7b, llama3.1:8b+).",
      );
    }

    return {
      toolCalls: toolCalls.map((tc) => ({
        tool: tc.function.name,
        arguments: tc.function.arguments,
      })),
      rawText: data.message.content ?? null,
    };
  }

  async callStructured<T>(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
  }): Promise<T> {
    // Use format:"json" mode — system prompt describes the expected schema
    const schemaDescription = JSON.stringify(args.outputSchema, null, 2);
    const systemWithSchema =
      `${args.systemPrompt}\n\n` +
      `IMPORTANT: Respond with valid JSON matching this schema:\n${schemaDescription}`;

    const messages: OllamaMessage[] = [
      { role: "system", content: systemWithSchema },
      { role: "user", content: args.userMessage },
    ];

    const data = (await this.post("/api/chat", {
      model: this.model,
      messages,
      format: "json",
      stream: false,
    })) as OllamaChatResponse;

    const text = data.message.content ?? "";
    this._lastRawText = text;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new Error(
        `Model ${this.model} returned invalid JSON in callStructured.\n` +
          `Raw response (first 500 chars): ${text.slice(0, 500)}`,
      );
    }
  }

  /** Raw text from the most recent callStructured call. Used by tolerant E2 parser. */
  lastRawText(): string | null {
    return this._lastRawText;
  }

  async callPlain(args: {
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string> {
    const messages: OllamaMessage[] = [
      { role: "system", content: args.systemPrompt },
      { role: "user", content: args.userMessage },
    ];

    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      stream: false,
    };
    if (args.maxTokens !== undefined) {
      body.options = { num_predict: args.maxTokens };
    }

    const data = (await this.post("/api/chat", body)) as OllamaChatResponse;
    return data.message.content ?? "";
  }

  lastCallMetadata(): CallMeta {
    return { ...this._lastMeta };
  }
}
