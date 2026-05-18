#!/usr/bin/env tsx
// ─── Slice 11: jam-actions-v0 Enrichment Runner (CLI) ────────────────────────
//
// Reads the overlay file at `datasets/jam-actions-v0/enrichment-overrides.json`,
// applies each entry to the corresponding source record under
// `datasets/jam-actions-v0/records/<id>.json`, and writes the merged record
// back to the same path (the source records are the runner's only writable
// target).
//
// The runner is the ONLY allowed pathway by which a record JSON's
// annotation_target / target_trace / scope.musical_phrase_label may change.
// Hand-edits to record JSONs are an architectural violation.
//
// Usage:
//   pnpm exec tsx scripts/apply-jam-actions-enrichment.ts
//   pnpm exec tsx scripts/apply-jam-actions-enrichment.ts --dry-run
//   pnpm exec tsx scripts/apply-jam-actions-enrichment.ts --check
//
// Flags:
//   --dry-run  Plan only — print what would change, write nothing.
//   --check    Assert no records would change. Exit non-zero if any would.
//              Useful as a CI gate after the slice ships (catches drift between
//              overlay and on-disk records).
//
// Idempotency: running this script twice in a row with the same overlay
// produces byte-identical record JSONs the second time (no diff on disk).
//
// Determinism: file order is sorted by record id; JSON formatting matches
// `formatJson` from src/dataset/package-public.ts (2-space indent + trailing
// newline) so the runner's output matches the rest of the corpus.
//
// Exit codes:
//   0  success (or, with --check, no drift)
//   1  any error (overlay malformed, source record missing, schema fail,
//      --check found drift)
// ─────────────────────────────────────────────────────────────────────────────

import {
  existsSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import {
  applyEnrichment,
  validateOverlayFile,
  type EnrichmentAudit,
  type EnrichmentOverlayEntry,
  type EnrichmentOverlayFile,
} from "../src/dataset/enrichment.js";

// ─── Paths ───────────────────────────────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets", "jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");
const OVERLAY_PATH = join(DATASET_ROOT, "enrichment-overrides.json");

// ─── CLI args ────────────────────────────────────────────────────────────────

interface CliArgs {
  dryRun: boolean;
  check: boolean;
}

function parseArgs(argv: string[]): CliArgs {
  let dryRun = false;
  let check = false;
  for (const a of argv) {
    if (a === "--dry-run") dryRun = true;
    else if (a === "--check") check = true;
    else if (a === "--help" || a === "-h") {
      printHelp();
      process.exit(0);
    } else {
      throw new Error(`Unknown arg: ${a}`);
    }
  }
  if (dryRun && check) {
    throw new Error("--dry-run and --check are mutually exclusive");
  }
  return { dryRun, check };
}

function printHelp(): void {
  console.log(`Usage: tsx scripts/apply-jam-actions-enrichment.ts [--dry-run | --check]

Applies enrichment-overrides.json to source records and writes the results back.

Options:
  --dry-run    Plan only — show what would change, write nothing.
  --check      Assert no records would change. Exit non-zero on drift.
  --help, -h   Print this help text.

Source overlay: ${OVERLAY_PATH}
Records dir:    ${RECORDS_DIR}
`);
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Stable JSON formatter — matches src/dataset/package-public.ts formatJson. */
function formatJson(obj: unknown): string {
  return JSON.stringify(obj, null, 2) + "\n";
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, "utf8")) as T;
}

function recordFilenameFromId(id: string): string {
  // ID shape: "<song-id>:<window>:piano:mcp-session:v1"
  // Filename: "<song-id>-<window>.json"
  const colonIdx = id.indexOf(":");
  if (colonIdx === -1) throw new Error(`Bad id: ${id}`);
  const songId = id.substring(0, colonIdx);
  const rest = id.substring(colonIdx + 1);
  const windowEnd = rest.indexOf(":");
  if (windowEnd === -1) throw new Error(`Bad id (no window): ${id}`);
  const windowSlice = rest.substring(0, windowEnd);
  return `${songId}-${windowSlice}.json`;
}

// ─── Main ────────────────────────────────────────────────────────────────────

interface PerRecordOutcome {
  record_id: string;
  filename: string;
  status: "changed" | "no-op" | "no-change-on-disk";
  audit: EnrichmentAudit;
}

function main(): void {
  const args = parseArgs(process.argv.slice(2));

  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Enrichment Runner (Slice 11)");
  console.log("=".repeat(70));
  console.log(`  Overlay:  ${OVERLAY_PATH}`);
  console.log(`  Records:  ${RECORDS_DIR}`);
  console.log(`  Mode:     ${args.dryRun ? "DRY RUN" : args.check ? "CHECK" : "APPLY"}`);
  console.log("");

  // 1. Load + validate overlay.
  if (!existsSync(OVERLAY_PATH)) {
    throw new Error(`Overlay file not found: ${OVERLAY_PATH}`);
  }
  const overlayRaw = readJson<unknown>(OVERLAY_PATH);
  const validation = validateOverlayFile(overlayRaw);
  if (!validation.ok) {
    throw new Error(`Overlay file is malformed: ${validation.error.message}`);
  }
  const overlay: EnrichmentOverlayFile = validation.data;

  const entries = Object.entries(overlay.overrides);
  console.log(`  Overlay version:                 ${overlay.version}`);
  console.log(`  Applied for dataset version:     ${overlay.applied_for_dataset_version}`);
  console.log(`  Schema version:                  ${overlay.schema_version}`);
  console.log(`  Applied at:                      ${overlay.applied_at}`);
  console.log(`  Overlay entries:                 ${entries.length}`);
  console.log("");

  if (entries.length === 0) {
    console.log("  (Overlay is empty — nothing to do.)");
    return;
  }

  // 2. Verify every record-id mentioned in the overlay exists on disk.
  const availableFiles = new Set(readdirSync(RECORDS_DIR));
  for (const [id] of entries) {
    const fname = recordFilenameFromId(id);
    if (!availableFiles.has(fname)) {
      throw new Error(
        `Overlay references record id ${id} but ${fname} is not on disk under ${RECORDS_DIR}.`,
      );
    }
  }

  // 3. Apply every overlay entry (sorted by record id for deterministic output).
  const sortedEntries: Array<[string, EnrichmentOverlayEntry]> = [...entries].sort(
    ([a], [b]) => (a < b ? -1 : a > b ? 1 : 0),
  );

  const outcomes: PerRecordOutcome[] = [];
  let changedCount = 0;
  let driftCount = 0;

  for (const [id, overlayEntry] of sortedEntries) {
    const fname = recordFilenameFromId(id);
    const absPath = join(RECORDS_DIR, fname);
    const onDiskRaw = readFileSync(absPath, "utf8");
    const onDiskRecord = JSON.parse(onDiskRaw) as unknown;

    const result = applyEnrichment(onDiskRecord, overlayEntry);
    if (!result.ok) {
      throw new Error(
        `applyEnrichment failed for record ${id}: [${result.error.code}] ${result.error.message}`,
      );
    }
    const mergedJson = formatJson(result.record);
    const onDiskMatchesMerged = onDiskRaw === mergedJson;

    let status: PerRecordOutcome["status"];
    if (result.audit.fields_overridden.length === 0) {
      status = "no-op";
    } else if (onDiskMatchesMerged) {
      status = "no-change-on-disk";
    } else {
      status = "changed";
      changedCount += 1;
      driftCount += 1;
    }

    outcomes.push({
      record_id: id,
      filename: fname,
      status,
      audit: result.audit,
    });

    // Write back unless dry-run / check.
    if (!args.dryRun && !args.check && status === "changed") {
      writeFileSync(absPath, mergedJson, "utf8");
    }
  }

  // 4. Per-record summary.
  for (const o of outcomes) {
    const tag =
      o.status === "changed"
        ? args.check
          ? "[DRIFT]"
          : args.dryRun
          ? "[WOULD WRITE]"
          : "[WRITTEN]"
        : o.status === "no-change-on-disk"
        ? "[UNCHANGED — overlay matches on-disk]"
        : "[NO-OP — overlay has no enrichable fields]";
    console.log(`  ${tag} ${o.record_id}`);
    if (o.audit.fields_overridden.length > 0) {
      console.log(`      fields: ${o.audit.fields_overridden.join(", ")}`);
    }
  }

  // 5. Aggregate.
  console.log("");
  console.log("─".repeat(70));
  const totalChangedOrDrift = changedCount;
  if (args.check) {
    if (totalChangedOrDrift > 0) {
      console.error(
        `  CHECK FAILED: ${totalChangedOrDrift} record(s) would change if runner were re-run.`,
      );
      console.error(
        "  Run the runner without --check to refresh on-disk records, or revise the overlay.",
      );
      process.exit(1);
    }
    console.log(`  CHECK PASS: ${entries.length} overlay entries; 0 records would change.`);
  } else if (args.dryRun) {
    console.log(`  DRY RUN: ${totalChangedOrDrift} record(s) would be written; ${entries.length - totalChangedOrDrift} unchanged on disk.`);
  } else {
    console.log(`  APPLIED: ${changedCount} record(s) written; ${entries.length - changedCount} already in sync.`);
  }
  console.log("");
}

try {
  main();
} catch (err) {
  console.error(`\nFATAL: ${(err as Error).message}`);
  process.exit(1);
}
