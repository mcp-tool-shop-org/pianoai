#!/usr/bin/env tsx
// ─── jam-actions-v0 Slice 2.5 — URL Verification Runner ──────────────────────
//
// Reads `provenance-scan.json`, runs the URL verifier against each
// `public_candidate` song (polite live HTTP), mutates the 145 record JSONs
// per the kickoff's rules, writes `provenance-verification.json`, and updates
// `manifest.json.verdict_summary`.
//
// Politeness (locked kickoff E):
//   - 1 req/sec between fetches: after EACH song we sleep RATE_LIMIT_MS, and
//     the verifier itself does 2 fetches (site + composer) — we sleep
//     RATE_LIMIT_MS between those too via a small wrapper.
//   - User-Agent string baked into the verifier module.
//
// Idempotency: re-running with the same upstream state produces byte-identical
// records (modulo verified_at — pass `--today` to control that).
//
// Usage:
//   pnpm exec tsx scripts/verify-dataset-provenance-urls.ts
//   pnpm exec tsx scripts/verify-dataset-provenance-urls.ts --dry-run
//   pnpm exec tsx scripts/verify-dataset-provenance-urls.ts --today 2026-05-17
//
// Exit 0 on success, non-zero on hard runtime error. A song that fails
// verification is NOT a runtime error — it is a recorded result.
// ─────────────────────────────────────────────────────────────────────────────

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  verifyProvenanceUrl,
  POLITENESS_DEFAULTS,
  type VerificationResult,
} from "../src/dataset/provenance-url-verifier.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DATASET_ROOT = join(REPO_ROOT, "datasets", "jam-actions-v0");
const RECORDS_DIR = join(DATASET_ROOT, "records");

const SCAN_PATH = join(DATASET_ROOT, "provenance-scan.json");
const MANIFEST_PATH = join(DATASET_ROOT, "manifest.json");
const REPORT_PATH = join(DATASET_ROOT, "provenance-verification.json");

// ─── CLI flags ────────────────────────────────────────────────────────────────

interface CliFlags {
  dryRun: boolean;
  today: string;
}

function parseCli(argv: string[]): CliFlags {
  let dryRun = false;
  let today = new Date().toISOString().slice(0, 10);
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") {
      dryRun = true;
    } else if (a === "--today") {
      const next = argv[++i];
      if (!next || !/^\d{4}-\d{2}-\d{2}$/.test(next)) {
        throw new Error(`--today requires YYYY-MM-DD, got ${next ?? "(missing)"}`);
      }
      today = next;
    } else {
      throw new Error(`Unknown flag: ${a}`);
    }
  }
  return { dryRun, today };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface ScanRecord {
  song_id: string;
  song_title: string;
  verdict: string;
  extracted_fields: {
    arrangement_creator: string | null;
    arrangement_license: string | null;
    arrangement_evidence_url: string | null;
  };
}

function loadCandidates(): ScanRecord[] {
  const scan = JSON.parse(readFileSync(SCAN_PATH, "utf8"));
  return (scan.records as ScanRecord[]).filter(
    (r) => r.verdict === "public_candidate",
  );
}

function loadRecordFilesBySong(songIds: string[]): Map<string, string[]> {
  const all = readdirSync(RECORDS_DIR).filter((f) => f.endsWith(".json"));
  const bySong = new Map<string, string[]>();
  for (const id of songIds) bySong.set(id, []);
  for (const f of all) {
    // Filenames look like `<song_id>-m001-004.json`. We use prefix match against
    // the longest song_id that fits the filename (handles overlapping prefixes
    // like "chopin-prelude-e-minor" vs "chopin-prelude" — none exist today but
    // be defensive). Use the record's own `scope.song_id` for ground truth.
    const path = join(RECORDS_DIR, f);
    let rec: any;
    try {
      rec = JSON.parse(readFileSync(path, "utf8"));
    } catch (e) {
      continue; // skip unreadable
    }
    const sid = rec?.scope?.song_id;
    if (sid && bySong.has(sid)) {
      bySong.get(sid)!.push(f);
    }
  }
  return bySong;
}

// ─── Per-record surgical mutation ─────────────────────────────────────────────
//
// Per kickoff C:
//   - promoted song → record_verdict + license_version + evidence_url + verifier
//     + verified_at + verdict_reason all update. training_use_permitted stays true.
//   - kept public_candidate → verifier + verified_at + verdict_reason update;
//     license_version updates only if confidently parsed; record_verdict stays.
//   - demoted → record_verdict + verifier + verified_at + verdict_reason update,
//     training_use_permitted re-derived.
//
// All other fields (id, schema_version, scope, observation, traces) untouched.

interface MutateArgs {
  recordPath: string;
  result: VerificationResult;
  isPromoted: boolean;
  isDemoted: boolean;
}

function mutateRecord({
  recordPath,
  result,
  isPromoted,
  isDemoted,
}: MutateArgs): void {
  const rec = JSON.parse(readFileSync(recordPath, "utf8"));
  const prov = rec.provenance;
  if (prov == null) {
    throw new Error(`record ${recordPath} has no provenance block`);
  }

  // Always-update fields (every record visited by verification gets these).
  prov.verifier = "auto-rule-engine+slice2.5-url-verifier";
  prov.verified_at = result.verified_at;
  prov.verdict_reason = result.verdict_reason;

  // License version: update if confidently parsed (any verdict), null otherwise.
  if (result.license_version_detected != null) {
    prov.arrangement_license_version = result.license_version_detected;
  }
  // If version not detected, leave the field as-is (null in current corpus).

  // Correct source_url to canonical scheme. Slice 1/2 stamped records with
  // `https://piano-midi.de/` but piano-midi.de has no HTTPS endpoint (port 443
  // returns plain HTTP, not TLS). Slice 2.5 corrects the canonical URL on
  // every verified record. We only narrow the scheme — the hostname/path stay.
  if (
    typeof prov.source_url === "string" &&
    prov.source_url.startsWith("https://piano-midi.de")
  ) {
    prov.source_url = prov.source_url.replace(
      /^https:\/\/piano-midi\.de/,
      "http://piano-midi.de",
    );
  }

  // Verdict transition.
  if (isPromoted) {
    prov.record_verdict = "public";
    prov.arrangement_evidence_url = result.evidence_url_chosen;
    prov.training_use_permitted = true;
  } else if (isDemoted) {
    prov.record_verdict = result.post_verdict; // "internal" or "excluded"
    prov.training_use_permitted = result.training_use_permitted;
    // Demoted: also update evidence_url to deepest reached (audit trail).
    prov.arrangement_evidence_url = result.evidence_url_chosen;
  } else {
    // Stays public_candidate — record_verdict + training_use_permitted unchanged.
    // We still update evidence_url to the deepest URL we actually reached so the
    // audit trail reflects the verification attempt (kickoff A).
    prov.arrangement_evidence_url = result.evidence_url_chosen;
  }

  // Serialize with stable formatting (2-space indent, trailing newline) — same
  // shape Slice 9b used so git diffs read cleanly.
  writeFileSync(recordPath, JSON.stringify(rec, null, 2) + "\n", "utf8");
}

// ─── Main ─────────────────────────────────────────────────────────────────────

interface SongReport extends VerificationResult {
  records_count: number;
}

async function main(): Promise<void> {
  const flags = parseCli(process.argv);

  console.log("=".repeat(70));
  console.log(" jam-actions-v0 Slice 2.5 — URL Verification Runner");
  console.log("=".repeat(70));
  console.log(`  Today               : ${flags.today}`);
  console.log(`  Dry run             : ${flags.dryRun}`);
  console.log(`  Rate limit (ms)     : ${POLITENESS_DEFAULTS.RATE_LIMIT_MS}`);
  console.log(`  User-Agent          : ${POLITENESS_DEFAULTS.USER_AGENT}`);
  console.log(`  Per-request timeout : ${POLITENESS_DEFAULTS.TIMEOUT_MS} ms`);
  console.log("");

  // Load scan and pick candidates.
  const candidates = loadCandidates();
  console.log(`  Candidates          : ${candidates.length}`);
  if (candidates.length === 0) {
    console.error("No public_candidate songs in provenance-scan.json. Nothing to do.");
    process.exit(1);
  }

  // Map records by song.
  const recordsBySong = loadRecordFilesBySong(candidates.map((c) => c.song_id));
  for (const c of candidates) {
    const files = recordsBySong.get(c.song_id) ?? [];
    console.log(`    ${c.song_id.padEnd(34)} → ${files.length.toString().padStart(2)} records`);
  }
  console.log("");

  // Run the verifier per candidate, paced.
  const reports: SongReport[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    if (i > 0) {
      // 1 req/sec between songs. Each song does 2 fetches internally; we add an
      // additional sleep here so the outer cadence is also 1 req/sec.
      await sleep(POLITENESS_DEFAULTS.RATE_LIMIT_MS);
    }

    console.log(`[${i + 1}/${candidates.length}] verifying ${c.song_id}`);
    const result = await verifyProvenanceUrl({
      song_id: c.song_id,
      song_title: c.song_title,
      claimed_license: c.extracted_fields.arrangement_license ?? "",
      claimed_creator: c.extracted_fields.arrangement_creator ?? "",
      today: flags.today,
      // Wrap fetch to insert 1s between site + composer requests within a song.
      fetchImpl: makePacedFetch(POLITENESS_DEFAULTS.RATE_LIMIT_MS),
    });

    const records = recordsBySong.get(c.song_id) ?? [];
    reports.push({ ...result, records_count: records.length });

    console.log(
      `        ${result.pre_verdict} → ${result.post_verdict}`,
      result.license_detected
        ? `(${result.license_detected}${result.license_version_detected ? "-" + result.license_version_detected : ""})`
        : "(no license detected)",
    );
    if (result.failure_reasons.length > 0) {
      console.log(`        notes: ${result.failure_reasons.join(" | ")}`);
    }
  }

  // Summarize.
  const summaryCounts: Record<string, number> = {
    public: 0,
    public_candidate: 0,
    internal: 0,
    excluded: 0,
  };
  for (const r of reports) summaryCounts[r.post_verdict]++;

  const failureReasonCounts: Record<string, number> = {};
  for (const r of reports) {
    for (const reason of r.failure_reasons) {
      failureReasonCounts[reason] = (failureReasonCounts[reason] ?? 0) + 1;
    }
  }

  console.log("\nSong-level summary:");
  console.log(JSON.stringify(summaryCounts, null, 2));

  // Apply per-record mutations.
  let recordsMutated = 0;
  let recordsPromoted = 0;
  let recordsDemoted = 0;
  let recordsKept = 0;

  if (!flags.dryRun) {
    for (const r of reports) {
      const isPromoted = r.post_verdict === "public";
      const isDemoted =
        r.post_verdict === "internal" || r.post_verdict === "excluded";
      const files = recordsBySong.get(r.song_id) ?? [];
      for (const f of files) {
        mutateRecord({
          recordPath: join(RECORDS_DIR, f),
          result: r,
          isPromoted,
          isDemoted,
        });
        recordsMutated++;
        if (isPromoted) recordsPromoted++;
        else if (isDemoted) recordsDemoted++;
        else recordsKept++;
      }
    }
    console.log(
      `\nRecords mutated: ${recordsMutated} (promoted=${recordsPromoted}, kept=${recordsKept}, demoted=${recordsDemoted}).`,
    );
  } else {
    console.log("\nDry run: no record mutations.");
  }

  // Compose record-level summary too (mirrors song-level).
  const recordSummaryCounts: Record<string, number> = {
    public: 0,
    public_candidate: 0,
    internal: 0,
    excluded: 0,
  };
  for (const r of reports) {
    const n = r.records_count;
    recordSummaryCounts[r.post_verdict] += n;
  }

  // Write the verification report.
  const reportDoc = {
    slice: "jam-actions-v0/slice2.5",
    verified_at: flags.today,
    politeness_defaults: {
      rate_limit_ms: POLITENESS_DEFAULTS.RATE_LIMIT_MS,
      user_agent: POLITENESS_DEFAULTS.USER_AGENT,
      timeout_ms: POLITENESS_DEFAULTS.TIMEOUT_MS,
      retry_backoff_ms: POLITENESS_DEFAULTS.RETRY_BACKOFF_MS,
      retries: POLITENESS_DEFAULTS.RETRIES,
    },
    total_candidates: candidates.length,
    songs: reports.map((r) => ({
      song_id: r.song_id,
      song_title: candidates.find((c) => c.song_id === r.song_id)?.song_title ?? "",
      pre_verdict: r.pre_verdict,
      post_verdict: r.post_verdict,
      license_detected: r.license_detected,
      license_version_detected: r.license_version_detected,
      arrangement_creator_confirmed: r.arrangement_creator_confirmed,
      song_title_confirmed: r.song_title_confirmed,
      evidence_url_chosen: r.evidence_url_chosen,
      failure_reasons: r.failure_reasons,
      records_count: r.records_count,
      verified_at: r.verified_at,
      verification_attempts: r.verification_attempts.map((a) => ({
        url: a.url,
        status: a.status,
        fetched_at: a.fetched_at,
        response_size_bytes: a.response_size_bytes,
        retried: a.retried,
        license_text_excerpt: a.license_text_excerpt,
        ...(a.error ? { error: a.error } : {}),
      })),
    })),
    summary: {
      promoted_to_public: summaryCounts.public,
      kept_public_candidate: summaryCounts.public_candidate,
      demoted_to_internal: summaryCounts.internal,
      demoted_to_excluded: summaryCounts.excluded,
      summary_failures_by_reason: failureReasonCounts,
      record_level_counts: recordSummaryCounts,
    },
  };

  if (!flags.dryRun) {
    writeFileSync(REPORT_PATH, JSON.stringify(reportDoc, null, 2) + "\n", "utf8");
    console.log(`\nReport written: ${REPORT_PATH}`);
  } else {
    console.log("\nDry run: report not written.");
  }

  // Update manifest.json verdict_summary block, preserve instrument_surfaces.
  if (!flags.dryRun) {
    const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
    const newVerdict: Record<string, number> = {};
    for (const k of ["public", "public_candidate", "internal", "excluded"]) {
      if (recordSummaryCounts[k] > 0 || k === "public_candidate") {
        newVerdict[k] = recordSummaryCounts[k];
      } else {
        newVerdict[k] = 0;
      }
    }
    // Always emit all four keys with 0 default — matches existing manifest shape.
    manifest.verdict_summary = {
      public: recordSummaryCounts.public,
      public_candidate: recordSummaryCounts.public_candidate,
      internal: recordSummaryCounts.internal,
      excluded: recordSummaryCounts.excluded,
    };
    // CRITICAL: do NOT touch instrument_surfaces — verify both blocks present.
    if (
      manifest.instrument_surfaces == null ||
      manifest.instrument_surfaces.ai_jam_sessions == null ||
      manifest.instrument_surfaces.vocal_synth_engine == null
    ) {
      throw new Error(
        "manifest.instrument_surfaces.{ai_jam_sessions, vocal_synth_engine} blocks missing — refusing to write a damaged manifest. Restore them and re-run.",
      );
    }
    writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n", "utf8");
    console.log(`Manifest updated: ${MANIFEST_PATH}`);
  }

  console.log("\nDone.");
}

// ─── Paced fetch wrapper ──────────────────────────────────────────────────────
//
// Within a single song crawl the verifier makes up to 2 fetches (site root +
// composer page). We pace the second fetch by RATE_LIMIT_MS using a tiny
// closure around `fetch` so the politeness contract holds inside the song too.

function makePacedFetch(rateLimitMs: number): typeof fetch {
  let firstCallDone = false;
  return (async (input: RequestInfo | URL, init?: RequestInit) => {
    if (firstCallDone) {
      await sleep(rateLimitMs);
    }
    firstCallDone = true;
    return fetch(input, init);
  }) as typeof fetch;
}

// ─── Entry point ─────────────────────────────────────────────────────────────

if (!existsSync(SCAN_PATH)) {
  console.error(`Scan file not found: ${SCAN_PATH}`);
  process.exit(2);
}

main().catch((e) => {
  console.error("Runner failed:", e);
  process.exit(3);
});
