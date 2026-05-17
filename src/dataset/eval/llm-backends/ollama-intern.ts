// ─── Ollama Intern MCP Backend ────────────────────────────────────────────────
//
// Adapter for the ollama-intern-mcp server (local LLM via MCP protocol).
//
// DESIGN FINDING (Slice 7.5 investigation, 2026-05-16):
//
//   ollama-intern-mcp DOES expose a generic chat primitive: `ollama_chat`.
//   Schema: { messages: [{role, content}][], system?: string, model?: string }
//   Return: { reply: string, last_resort: true }
//
//   However, connecting to it requires spawning an MCP subprocess and using
//   the MCP SDK's stdio transport — which adds significant complexity for eval
//   usage. The intern's `ollama_chat` internally calls `localhost:11434`, the
//   same endpoint the raw Ollama HTTP backend targets directly.
//
//   Decision: the OllamaInternBackend wraps the raw OllamaBackend, which calls
//   Ollama HTTP directly. This gives the same model access with simpler wiring.
//   If the intern MCP server is running and configured, its presence is
//   confirmed but we bypass the MCP protocol for eval purposes (the intern
//   adds value for bulk analysis, memory, and context-window management, not
//   for raw eval inference).
//
//   The `--backend ollama-intern` flag is valid and functional; it just uses
//   raw Ollama HTTP under the hood, the same way the intern does internally.
//   Users who want to use the intern's opinionated tools (summarize, extract,
//   etc.) should call those tools directly; this backend is for raw eval calls.
//
// ALTERNATIVE IF NEEDED:
//   To call the intern via full MCP protocol, you would:
//     1. Spawn: `npx ollama-intern-mcp` as a subprocess
//     2. Connect via @modelcontextprotocol/sdk StdioClientTransport
//     3. Call the `ollama_chat` tool via client.callTool(...)
//   This is deferred — the raw HTTP floor is sufficient for eval purposes.
//
// Fail-fast: verifies Ollama is reachable at startup; if not, provides the
//   same actionable error as the raw Ollama backend.
// ─────────────────────────────────────────────────────────────────────────────

import type { LlmBackend, ToolSchema, ToolUseResult, CallMeta } from "../llm-runner.js";
import { OllamaBackend } from "./ollama.js";

export class OllamaInternBackend implements LlmBackend {
  readonly name = "ollama-intern";
  readonly model: string;
  private readonly _inner: OllamaBackend;

  constructor(model: string, baseUrl?: string) {
    this.model = model;
    // Delegate to raw Ollama HTTP — same endpoint the intern uses internally.
    // See design finding above for rationale.
    this._inner = new OllamaBackend(model, baseUrl);
  }

  /**
   * Probe reachability. Confirms Ollama is running.
   * Note: does NOT check whether the ollama-intern-mcp process is running,
   * since this adapter bypasses MCP and calls Ollama HTTP directly.
   */
  async probe(): Promise<void> {
    await this._inner.probe();
  }

  async callWithTools(args: {
    systemPrompt: string;
    userMessage: string;
    tools: ToolSchema[];
  }): Promise<ToolUseResult> {
    return this._inner.callWithTools(args);
  }

  async callStructured<T>(args: {
    systemPrompt: string;
    userMessage: string;
    outputSchema: Record<string, unknown>;
  }): Promise<T> {
    return this._inner.callStructured<T>(args);
  }

  async callPlain(args: {
    systemPrompt: string;
    userMessage: string;
    maxTokens?: number;
  }): Promise<string> {
    return this._inner.callPlain(args);
  }

  lastCallMetadata(): CallMeta {
    return this._inner.lastCallMetadata();
  }

  /** Raw text from the most recent callStructured call. Used by tolerant E2 parser. */
  lastRawText(): string | null {
    return this._inner.lastRawText();
  }
}

/**
 * Design note for future extension:
 *
 * If you want to add a true MCP-protocol connection to the intern (calling
 * its `ollama_chat` tool via the MCP stdio transport), the shape would be:
 *
 * ```ts
 * import { Client } from "@modelcontextprotocol/sdk/client/index.js";
 * import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
 *
 * const transport = new StdioClientTransport({
 *   command: "npx",
 *   args: ["ollama-intern-mcp"],
 * });
 * const client = new Client({ name: "jam-actions-eval", version: "1.0.0" });
 * await client.connect(transport);
 *
 * const result = await client.callTool("ollama_chat", {
 *   messages: [{ role: "user", content: userMessage }],
 *   system: systemPrompt,
 *   model: this.model,
 * });
 * // result.content[0].text = JSON.stringify({ reply: "...", last_resort: true })
 * ```
 *
 * The return shape from ollama_chat is: { reply: string, last_resort: true }
 * The `reply` field is the raw text response.
 *
 * For tool-use (E1) via intern: there is no native tool-call primitive in
 * ollama-intern-mcp; you would need to parse tool calls from the `reply`
 * field using a system prompt that instructs structured JSON output. The raw
 * Ollama HTTP backend handles this more cleanly via the `tools` parameter.
 */
