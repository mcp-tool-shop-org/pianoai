// Shared MCP tool error envelope (Shipcheck B.1 / P9-002).
// Same JSON {error:{code,message,hint}} compose_panel and auto_reharmonize already emit.

export function mcpStructuredError(code: string, message: string, hint: string) {
  return {
    content: [
      {
        type: "text" as const,
        text: `❌ ${message}\n\n` + JSON.stringify({ error: { code, message, hint } }, null, 2),
      },
    ],
    isError: true as const,
  };
}
