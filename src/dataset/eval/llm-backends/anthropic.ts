// ─── Anthropic Backend (Optional) ─────────────────────────────────────────────
//
// Optional Anthropic SDK adapter. Only loaded when --backend anthropic is passed.
// Requires ANTHROPIC_API_KEY in environment; fails fast if missing.
//
// Design constraints:
//   - Dynamic import only — do NOT import at module load in llm-runner.ts
//   - Prompt caching mandatory (cache_control: ephemeral on stable content)
//   - Exponential backoff retry: max 3 retries on 429/5xx
//   - Cost reporting: real USD estimates (input/cached/output pricing)
//
// Pricing as of Slice 7.5 (claude-sonnet-4-5):
//   Input:        $3.00 / M tokens
//   Cached input: $0.30 / M tokens (90% discount)
//   Output:       $15.00 / M tokens
//
// This file may be imported normally from the CLI script, but should only be
// reached when --backend anthropic is passed. The CLI does dynamic import to
// ensure the SDK is never loaded for local backends.
// ─────────────────────────────────────────────────────────────────────────────

import type { LlmBackend, ToolSchema, ToolUseResult, CallMeta } from "../llm-runner.js";

// Pricing constants
const INPUT_COST_PER_MILLION = 3.0;
const CACHED_INPUT_COST_PER_MILLION = 0.30;
const OUTPUT_COST_PER_MILLION = 15.0;

function estimateCost(
  inputTokens: number,
  cachedInputTokens: number,
  outputTokens: number,
): number {
  const uncachedInput = inputTokens - cachedInputTokens;
  return (
    (uncachedInput * INPUT_COST_PER_MILLION) / 1_000_000 +
    (cachedInputTokens * CACHED_INPUT_COST_PER_MILLION) / 1_000_000 +
    (outputTokens * OUTPUT_COST_PER_MILLION) / 1_000_000
  );
}

// ─── Anthropic SDK types (imported dynamically) ────────────────────────────────

// We use 'unknown' for the Anthropic module type to avoid static import.
// All SDK type usage is internal to this file.
type AnthropicModule = {
  default: new (opts: { apiKey: string }) => AnthropicClient;
  RateLimitError: new (...args: unknown[]) => Error & { status: number };
  InternalServerError: new (...args: unknown[]) => Error & { status: number };
};

type AnthropicClient = {
  messages: {
    create: (params: unknown) => Promise<AnthropicMessage>;
  };
};

type AnthropicMessage = {
  id: string;
  model: string;
  content: AnthropicContentBlock[];
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
};

type AnthropicContentBlock =
  | { type: "text"; text: string }
  | { type: "tool_use"; id: string; name: string; input: unknown };

// ─── Retry helper ─────────────────────────────────────────────────────────────

async function withRetry<T>(
  fn: () => Promise<T>,
  isRetryable: (err: unknown) => boolean,
  maxRetries = 3,
): Promise<T> {
  let attempt = 0;
  while (true) {
    try {
      return await fn();
    } catch (err: unknown) {
      if (!isRetryable(err) || attempt >= maxRetries) throw err;
      const delayMs = Math.pow(2, attempt) * 1000;
      await new Promise((r) => setTimeout(r, delayMs));
      attempt++;
    }
  }
}

// ─── Backend implementation ───────────────────────────────────────────────────

export class AnthropicBackend implements LlmBackend {
  readonly name = "anthropic";
  readonly model: string;
  private _client: AnthropicClient | null = null;
  private _sdk: AnthropicModule | null = null;
  private _lastMeta: CallMeta = {
    promptTokens: 0,
    completionTokens: 0,
    latencyMs: 0,
    costEstimate: 0,
  };

  constructor(model: string) {
    this.model = model;
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error(
        "ANTHROPIC_API_KEY is not set in environment.\n" +
          "Export it before running: export ANTHROPIC_API_KEY=sk-ant-...\n" +
          "Or choose a local backend: --backend ollama or --backend ollama-intern",
      );
    }
  }

  private async getClient(): Promise<{ client: AnthropicClient; sdk: AnthropicModule }> {
    if (this._client && this._sdk) {
      return { client: this._client, sdk: this._sdk };
    }
    // Dynamic import — only loaded when this backend is actually used
    const sdk = (await import("@anthropic-ai/sdk")) as unknown as AnthropicModule;
    this._sdk = sdk;
    this._client = new sdk.default({
      apiKey: process.env.ANTHROPIC_API_KEY!,
    });
    return { client: this._client, sdk };
  }

  private makeIsRetryable(sdk: AnthropicModule): (err: unknown) => boolean {
    return (err: unknown): boolean => {
      return (
        err instanceof sdk.RateLimitError ||
        err instanceof sdk.InternalServerError
      );
    };
  }

  private extractUsage(
    usage: AnthropicMessage["usage"],
  ): { promptTokens: number; cachedTokens: number; completionTokens: number } {
    return {
      promptTokens: usage.input_tokens,
      cachedTokens: usage.cache_read_input_tokens ?? 0,
      completionTokens: usage.output_tokens,
    };
  }

  async callWithTools(args: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolSchema[];
  }): Promise<ToolUseResult> {
    const { client, sdk } = await this.getClient();
    const isRetryable = this.makeIsRetryable(sdk);

    // Build tools with cache_control on the last tool to cache the tool list
    const apiTools = args.tools.map((t, idx) => {
      const isLast = idx === args.tools.length - 1;
      const tool: Record<string, unknown> = {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema,
      };
      if (isLast) {
        tool["cache_control"] = { type: "ephemeral" };
      }
      return tool;
    });

    const t0 = Date.now();
    const msg = await withRetry(
      () =>
        client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system: [
            {
              type: "text",
              text: args.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: apiTools,
          messages: [{ role: "user", content: args.userMessage }],
        }),
      isRetryable,
    );
    const latencyMs = Date.now() - t0;

    const { promptTokens, cachedTokens, completionTokens } = this.extractUsage(msg.usage);
    this._lastMeta = {
      promptTokens,
      completionTokens,
      latencyMs,
      costEstimate: estimateCost(promptTokens, cachedTokens, completionTokens),
    };

    const toolCalls = msg.content
      .filter((b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> => b.type === "tool_use")
      .map((b) => ({
        tool: b.name,
        arguments: b.input as Record<string, unknown>,
      }));

    const rawText = msg.content
      .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n") || null;

    return { toolCalls, rawText };
  }

  async callStructured<T>(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
  }): Promise<T> {
    const { client, sdk } = await this.getClient();
    const isRetryable = this.makeIsRetryable(sdk);

    // Force structured output via a single predict_continuation tool
    const outputTool: Record<string, unknown> = {
      name: "predict_continuation",
      description: "Output the structured prediction result.",
      input_schema: args.outputSchema,
      cache_control: { type: "ephemeral" },
    };

    const t0 = Date.now();
    const msg = await withRetry(
      () =>
        client.messages.create({
          model: this.model,
          max_tokens: 2048,
          system: [
            {
              type: "text",
              text: args.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          tools: [outputTool],
          tool_choice: { type: "tool", name: "predict_continuation" },
          messages: [{ role: "user", content: args.userMessage }],
        }),
      isRetryable,
    );
    const latencyMs = Date.now() - t0;

    const { promptTokens, cachedTokens, completionTokens } = this.extractUsage(msg.usage);
    this._lastMeta = {
      promptTokens,
      completionTokens,
      latencyMs,
      costEstimate: estimateCost(promptTokens, cachedTokens, completionTokens),
    };

    const toolBlock = msg.content.find(
      (b): b is Extract<AnthropicContentBlock, { type: "tool_use" }> =>
        b.type === "tool_use" && (b as { name: string }).name === "predict_continuation",
    );
    if (!toolBlock) {
      throw new Error(
        `Anthropic model ${this.model} did not call predict_continuation tool. ` +
          "Response had no tool_use block matching expected tool name.",
      );
    }
    return toolBlock.input as T;
  }

  async callPlain(args: {
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string> {
    const { client, sdk } = await this.getClient();
    const isRetryable = this.makeIsRetryable(sdk);

    const t0 = Date.now();
    const msg = await withRetry(
      () =>
        client.messages.create({
          model: this.model,
          max_tokens: args.maxTokens ?? 16,
          system: [
            {
              type: "text",
              text: args.systemPrompt,
              cache_control: { type: "ephemeral" },
            },
          ],
          messages: [{ role: "user", content: args.userMessage }],
        }),
      isRetryable,
    );
    const latencyMs = Date.now() - t0;

    const { promptTokens, cachedTokens, completionTokens } = this.extractUsage(msg.usage);
    this._lastMeta = {
      promptTokens,
      completionTokens,
      latencyMs,
      costEstimate: estimateCost(promptTokens, cachedTokens, completionTokens),
    };

    return msg.content
      .filter((b): b is Extract<AnthropicContentBlock, { type: "text" }> => b.type === "text")
      .map((b) => b.text)
      .join("\n");
  }

  lastCallMetadata(): CallMeta {
    return { ...this._lastMeta };
  }
}
