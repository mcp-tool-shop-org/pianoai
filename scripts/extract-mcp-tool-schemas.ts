#!/usr/bin/env tsx
// Derive canonical MCP tool schemas by talking to the running server over stdio.
// Output: src/dataset/tool-schemas.json
//
// This script exists so the dataset spine NEVER hand-writes tool-schema JSON.
// Re-run after any server.tool() addition or change.

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "..");
const serverPath = join(repoRoot, "dist", "mcp-server.js");
const outPath = join(repoRoot, "src", "dataset", "tool-schemas.json");

async function main(): Promise<void> {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [serverPath],
    cwd: repoRoot,
    stderr: "inherit",
  });

  const client = new Client(
    { name: "extract-mcp-tool-schemas", version: "0.0.1" },
    { capabilities: {} },
  );

  await client.connect(transport);

  const { tools } = await client.listTools();

  const sorted = [...tools].sort((a, b) => a.name.localeCompare(b.name));

  const payload = {
    server_name: "ai-jam-sessions",
    derived_from: "dist/mcp-server.js via MCP tools/list",
    derived_at: new Date().toISOString(),
    tool_count: sorted.length,
    tools: sorted.map((t) => ({
      name: t.name,
      description: t.description ?? "",
      inputSchema: t.inputSchema,
    })),
  };

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  await client.close();

  console.log(`Wrote ${sorted.length} tool schemas to ${outPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
