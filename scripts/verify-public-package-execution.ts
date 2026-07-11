#!/usr/bin/env tsx
// ─── verify-public-package-execution.ts (v0.5.0 standing packaging gate) ─────
//
// Execution verification for the public dataset package: every UNIQUE frozen
// `tool_call` carried by the packaged records' `target_trace` is executed
// against the REAL MCP server (dist/mcp-server.js over MCP-stdio) and must
// return `isError: false`. Zero errors required — any failure exits 1.
//
// Why this gate exists: schema-only validation cannot see a call that is
// well-formed but impossible against the live tool surface. The finetune-arc
// G6a gate (experiments/finetune-arc-v1/scripts/build-v1-data.ts) executed
// every frozen jam call this way and caught the published-record defect
// `bach-prelude-c-major-bwv846:m061-064` — a play_song(61,64) window past the
// song's real 62-measure length (erratum-001). Erratum-001 §Known residuals
// recommends this as a STANDING packaging gate; this script is that gate.
// It joins the packaging pipeline beside the whole-corpus validator, the
// provenance URL verifier, and the RC release gate.
//
// RUNS ON A RIG WITH AN AUDIO DEVICE ONLY. `play_song` connects the real
// audio engine; on headless CI it fails `devicenotavailable` even for valid
// calls (see memory: ai-jam-sessions-ci-divergences). The publish workflow
// therefore verifies the SHIPPED receipt (whose record bytes are pinned by
// checksums.sha256) rather than re-running playback headless.
//
// Standards compliance (six standards, scored for this gate):
//   PIN_PER_STEP 2 (receipt embeds server-entry sha256, package version,
//   per-call results; deterministic call ordering) · ANDON_AUTHORITY 3
//   (exit 1 on any failure; the cut halts) · NAMED_COMPENSATORS 2 (read-only
//   + playback, every play_song followed by stop_playback; no irreversible
//   action) · DECOMPOSE_BY_SECRETS 2 (execution only — schema/pairs/splits
//   belong to the validator and packager) · UNCERTAINTY_GATED_HUMANS 2
//   (receipt feeds the operator-gated publish; this gate never publishes) ·
//   EXTERNAL_VERIFIER 3 (the verifier is the real server itself, never the
//   process that authored the traces).
//
// Usage:
//   pnpm exec tsx scripts/verify-public-package-execution.ts
//   pnpm exec tsx scripts/verify-public-package-execution.ts \
//     --out datasets/jam-actions-v0-public/evals/v0.5.0-execution-verification.json
//
// Requires a fresh `pnpm build` (the gate runs the compiled dist server —
// the exact artifact consumers run, not the TS source).
//
// Exit codes: 0 — every unique call executed with isError:false;
//             1 — any execution failure, missing dist, or malformed package.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DEFAULT_PACKAGE_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const SERVER_ENTRY = join(REPO_ROOT, "dist", "mcp-server.js");

// ─── CLI ─────────────────────────────────────────────────────────────────────

interface CliArgs {
  packageDir: string;
  out: string | null;
  quiet: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = { packageDir: DEFAULT_PACKAGE_DIR, out: null, quiet: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--package") {
      args.packageDir = argv[++i] ?? args.packageDir;
    } else if (a === "--out") {
      args.out = argv[++i] ?? null;
    } else if (a === "--quiet") {
      args.quiet = true;
    } else if (a === "--help" || a === "-h") {
      console.log(
        "Usage: verify-public-package-execution.ts [--package <dir>] [--out <receipt.json>] [--quiet]",
      );
      process.exit(0);
    } else {
      console.error(`Unknown arg: ${a}`);
      process.exit(1);
    }
  }
  return args;
}

// ─── Record shape (only the slice this gate reads) ───────────────────────────

interface FrozenToolCall {
  tool: string;
  arguments: Record<string, unknown>;
}

interface TraceTurn {
  role: string;
  tool_calls?: FrozenToolCall[];
}

interface PackagedRecord {
  id: string;
  target_trace?: { session?: TraceTurn[] };
}

interface CallResult {
  tool: string;
  arguments: Record<string, unknown>;
  record_ids: string[];
  ok: boolean;
  error_text?: string;
}

interface ToolResultShape {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

function sha256File(path: string): string {
  return createHash("sha256").update(readFileSync(path)).digest("hex");
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (!existsSync(SERVER_ENTRY)) {
    console.error(`FATAL: ${SERVER_ENTRY} not found — run \`pnpm build\` first.`);
    process.exit(1);
  }
  const recordsDir = join(args.packageDir, "records");
  if (!existsSync(recordsDir)) {
    console.error(`FATAL: records dir not found: ${recordsDir}`);
    process.exit(1);
  }

  const recordFiles = readdirSync(recordsDir)
    .filter((f) => f.endsWith(".json"))
    .sort();
  if (recordFiles.length === 0) {
    console.error(`FATAL: no records found under ${recordsDir}`);
    process.exit(1);
  }

  // Collect unique frozen calls, remembering which records carry each.
  const uniqueCalls = new Map<string, { call: FrozenToolCall; recordIds: Set<string> }>();
  let totalCallSites = 0;
  for (const f of recordFiles) {
    const rec = JSON.parse(readFileSync(join(recordsDir, f), "utf8")) as PackagedRecord;
    const turns = rec.target_trace?.session ?? [];
    for (const turn of turns) {
      if (turn.role !== "assistant" || !turn.tool_calls) continue;
      for (const tc of turn.tool_calls) {
        totalCallSites++;
        const key = `${tc.tool}|${JSON.stringify(tc.arguments)}`;
        const entry = uniqueCalls.get(key) ?? { call: tc, recordIds: new Set<string>() };
        entry.recordIds.add(rec.id);
        uniqueCalls.set(key, entry);
      }
    }
  }

  const sortedKeys = [...uniqueCalls.keys()].sort();
  if (!args.quiet) {
    console.log("=".repeat(70));
    console.log(" jam-actions-v0-public — Execution Verification (standing gate)");
    console.log("=".repeat(70));
    console.log(`  Package:      ${args.packageDir}`);
    console.log(`  Records:      ${recordFiles.length}`);
    console.log(`  Call sites:   ${totalCallSites}`);
    console.log(`  Unique calls: ${sortedKeys.length}`);
    console.log(`  Server:       ${SERVER_ENTRY}`);
  }

  // Isolated HOME so the server never reads/writes user config (repo test
  // pattern, proven by the finetune-arc G6a gate).
  const isolatedHome = mkdtempSync(join(tmpdir(), "jam-pkg-exec-"));
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [SERVER_ENTRY],
    env: { ...process.env, HOME: isolatedHome, USERPROFILE: isolatedHome },
    cwd: REPO_ROOT,
  });
  const client = new Client({ name: "public-package-exec-verify", version: "1.0.0" });
  await client.connect(transport);

  const results: CallResult[] = [];
  let executed = 0;
  try {
    for (const key of sortedKeys) {
      const { call, recordIds } = uniqueCalls.get(key)!;
      const res = (await client.callTool({
        name: call.tool,
        arguments: call.arguments,
      })) as ToolResultShape;
      executed++;
      const ok = res.isError !== true;
      const result: CallResult = {
        tool: call.tool,
        arguments: call.arguments,
        record_ids: [...recordIds].sort(),
        ok,
      };
      if (!ok) {
        result.error_text = res.content
          .filter((c) => c.type === "text" && c.text)
          .map((c) => c.text)
          .join(" ")
          .slice(0, 200);
      }
      results.push(result);
      // Playback hygiene: a side-effectful play_song is always stopped before
      // the next call, pass or fail.
      if (call.tool === "play_song") {
        await client.callTool({ name: "stop_playback", arguments: {} });
      }
    }
  } finally {
    await client.close();
  }

  const failures = results.filter((r) => !r.ok);
  const perTool = new Map<string, { total: number; failed: number }>();
  for (const r of results) {
    const t = perTool.get(r.tool) ?? { total: 0, failed: 0 };
    t.total++;
    if (!r.ok) t.failed++;
    perTool.set(r.tool, t);
  }

  if (!args.quiet) {
    console.log(`\n  Executed ${executed}/${sortedKeys.length} unique calls.`);
    for (const [tool, t] of [...perTool.entries()].sort()) {
      console.log(`    ${tool}: ${t.total - t.failed}/${t.total} ok`);
    }
    if (failures.length > 0) {
      console.error(`\n  FAILURES (${failures.length}):`);
      for (const f of failures) {
        console.error(
          `    - ${f.tool}(${JSON.stringify(f.arguments)}) [records: ${f.record_ids.join(", ")}]`,
        );
        console.error(`      ${f.error_text}`);
      }
    }
  }

  const verdict = failures.length === 0 ? "PASS" : "FAIL";
  if (args.out) {
    const receipt = {
      schema_version: "jam-actions-public-execution-verification/1.0.0",
      generated_at: new Date().toISOString(),
      generator: "scripts/verify-public-package-execution.ts",
      doctrine_note:
        "Standing packaging gate (erratum-001 §Known residuals): every unique frozen tool_call " +
        "in the packaged records must execute against the live MCP server with isError:false. " +
        "Zero errors required; any failure halts the package cut. The verifier is the real " +
        "server (dist/mcp-server.js over MCP-stdio), never the process that authored the traces.",
      package_version: existsSync(join(args.packageDir, "VERSION"))
        ? readFileSync(join(args.packageDir, "VERSION"), "utf8").trim()
        : null,
      server_entry: "dist/mcp-server.js",
      server_entry_sha256: sha256File(SERVER_ENTRY),
      record_count: recordFiles.length,
      tool_call_sites: totalCallSites,
      unique_calls: sortedKeys.length,
      executed,
      per_tool: Object.fromEntries([...perTool.entries()].sort().map(([k, v]) => [k, v])),
      failures,
      verdict,
    };
    writeFileSync(args.out, JSON.stringify(receipt, null, 2) + "\n", "utf8");
    if (!args.quiet) console.log(`\n  wrote receipt to ${args.out}`);
  }

  if (!args.quiet) {
    console.log(`\n  VERDICT: ${verdict}`);
  }
  process.exit(failures.length === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error(`FATAL: ${(err as Error).message}`);
  process.exit(1);
});
