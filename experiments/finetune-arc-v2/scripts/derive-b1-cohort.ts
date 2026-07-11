#!/usr/bin/env tsx
// ─── derive-b1-cohort.ts — Finetune Arc v2 (B-1): confirmatory cohort derivation ──
//
// Derives the preregistered B-1 confirmatory cohort (P0-LOCK.md §3) from the
// v0.5.0 public package, computes the exact two-sided sign-test victory bar
// as a NUMBER per effective n, and emits the receipt the lock pins.
// Deterministic: same package + same constants ⇒ byte-identical output.
//
// The cohort rule (frozen in P0-LOCK.md BEFORE any model call):
//   Stratum CL — ALL 12 clair-de-lune test-split records (the never-trained
//                confirmatory stratum; clair-de-lune has never appeared in any
//                training corpus, gate-asserted by finetune-arc-v1 G5).
//   Stratum LG — the 15 train-song records of the sealed slice19-cohort
//                (continuity with the v0/v1 sealed history; the cohort's 16th
//                record, clair m031-034, is counted once, in CL).
//   Stratum NW — 9 additional train-song records sampled WITHOUT replacement
//                from the 88 remaining train records: candidates sorted
//                lexicographically, Fisher-Yates shuffled with
//                mulberry32(20260712), first 9 taken.
//   Total: 36 records.
//
// Victory bar (exact, two-sided sign test, α = 0.05): wins ≥ k*(n_eff) where
// n_eff = 36 − ties and k*(n) = min{ k : 2·P(Bin(n, ½) ≥ k) ≤ 0.05 }.
// The full k*(n) table for n = 24..36 is emitted and frozen — no post-hoc
// threshold arithmetic is permitted after results exist.
//
// Usage:
//   pnpm exec tsx experiments/finetune-arc-v2/scripts/derive-b1-cohort.ts
//     [--out experiments/finetune-arc-v2/data/b1-cohort.json]
//     [--verify]   # gate mode: assert the harness's b1-confirm-cohort const
//                  # equals this derivation exactly (exit 1 on any drift)
//
// Standards compliance: PIN_PER_STEP 3 (fixed seed, sorted candidates,
// receipt emitted; double-derivable byte-identically) · ANDON 3 (--verify
// exits 1 on harness drift; all assertions hard-fail) · COMPENSATORS n/a
// (pure derivation, no irreversible action) · DECOMPOSE 2 (cohort derivation
// only; stats live in p6-stats-v2.ts) · UNCERTAINTY_GATED_HUMANS 2 (the lock
// + director gates consume this receipt) · EXTERNAL_VERIFIER 2 (verifies the
// harness const against an independent derivation from the package).
// ─────────────────────────────────────────────────────────────────────────────

import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const PACKAGE_DIR = join(REPO_ROOT, "datasets", "jam-actions-v0-public");
const HARNESS_PATH = join(REPO_ROOT, "scripts", "run-jam-actions-corpus-eval.ts");
const DEFAULT_OUT = join(REPO_ROOT, "experiments", "finetune-arc-v2", "data", "b1-cohort.json");

const COHORT_TOTAL = 36;
const NW_COUNT = 9;
const SAMPLER_SEED = 20260712;
const ALPHA = 0.05;

// Stratum LG: the 15 train-song records of the sealed slice19-cohort
// (SLICE_18_COHORT_RECORD_IDS + SLICE_19_FRESH_RECORD_IDS minus the one
// clair-de-lune record, which belongs to stratum CL). Stated literally here
// so the derivation is self-contained; --verify additionally cross-checks
// against the harness source.
const LG_RECORD_IDS: readonly string[] = [
  "bach-prelude-c-major-bwv846:m009-012:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m029-032:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m037-040:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  "pathetique-mvt2:m001-004:piano:mcp-session:v1",
  "pathetique-mvt2:m009-012:piano:mcp-session:v1",
  "pathetique-mvt2:m017-020:piano:mcp-session:v1",
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "schumann-traumerei:m001-004:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m009-012:piano:mcp-session:v1",
  "chopin-nocturne-op9-no2:m001-004:piano:mcp-session:v1",
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1",
];

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function binom(n: number, k: number): number {
  let r = 1;
  for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
  return r;
}

/** P(Bin(n, p) >= k), exact summation. */
function binomTailGe(n: number, k: number, p: number): number {
  let tail = 0;
  for (let i = k; i <= n; i++) tail += binom(n, i) * p ** i * (1 - p) ** (n - i);
  return tail;
}

/** min k such that the two-sided sign test rejects at alpha: 2*P(Bin(n,.5)>=k) <= alpha. */
function victoryBar(n: number, alpha: number): { k: number; p_at_k: number } {
  for (let k = Math.ceil(n / 2); k <= n; k++) {
    const p = Math.min(1, 2 * binomTailGe(n, k, 0.5));
    if (p <= alpha) return { k, p_at_k: p };
  }
  return { k: n + 1, p_at_k: NaN }; // unreachable for n >= 6
}

function fail(msg: string): never {
  console.error(`ANDON: ${msg}`);
  process.exit(1);
}

// ─── Derivation ───────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
let outPath = DEFAULT_OUT;
let verify = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === "--out") outPath = args[++i];
  else if (args[i] === "--verify") verify = true;
  else fail(`unknown arg: ${args[i]}`);
}

const splits = JSON.parse(readFileSync(join(PACKAGE_DIR, "splits.json"), "utf8")) as {
  train: string[];
  test: string[];
};
if (splits.train.length !== 103) fail(`expected 103 train records, got ${splits.train.length}`);
if (splits.test.length !== 12) fail(`expected 12 test records, got ${splits.test.length}`);
if (!splits.test.every((id) => id.startsWith("clair-de-lune:")))
  fail("test split contains a non-clair-de-lune id");

// Stratum CL: all 12 test records, sorted.
const CL = [...splits.test].sort();

// Stratum LG: assert every id is in the train split, no clair, no dupes.
const trainSet = new Set(splits.train);
const lgSet = new Set(LG_RECORD_IDS);
if (lgSet.size !== 15) fail("LG list has duplicates");
for (const id of LG_RECORD_IDS) {
  if (!trainSet.has(id)) fail(`LG id not in train split: ${id}`);
  if (id.startsWith("clair-de-lune:")) fail(`LG contains clair-de-lune: ${id}`);
}

// Stratum NW: seeded sample from the remaining train records.
const candidates = splits.train.filter((id) => !lgSet.has(id)).sort();
if (candidates.length !== 88) fail(`expected 88 NW candidates, got ${candidates.length}`);
const rng = mulberry32(SAMPLER_SEED);
const shuffled = [...candidates];
for (let i = shuffled.length - 1; i >= 1; i--) {
  const j = Math.floor(rng() * (i + 1));
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const NW = shuffled.slice(0, NW_COUNT).sort();

const cohort = [...CL, ...LG_RECORD_IDS, ...NW];
if (new Set(cohort).size !== COHORT_TOTAL) fail("cohort has duplicates or wrong size");
if (cohort.length !== COHORT_TOTAL) fail(`cohort size ${cohort.length} != ${COHORT_TOTAL}`);

// Every cohort record must exist as a packaged record file.
for (const id of cohort) {
  const song = id.split(":")[0];
  const window = id.split(":")[1];
  const file = join(PACKAGE_DIR, "records", `${song}-${window}.json`);
  if (!existsSync(file)) fail(`cohort record file missing from package: ${file}`);
}

// ─── Victory-bar + power tables ───────────────────────────────────────────────

const thresholdTable = [];
for (let n = 24; n <= COHORT_TOTAL; n++) {
  const { k, p_at_k } = victoryBar(n, ALPHA);
  thresholdTable.push({ n_eff: n, victory_bar_wins: k, exact_two_sided_p_at_bar: p_at_k });
}

const powerTable = [];
for (const nEff of [30, 32, 34, 36]) {
  const { k } = victoryBar(nEff, ALPHA);
  for (const p of [0.65, 0.7, 0.75, 0.8]) {
    powerTable.push({
      n_eff: nEff,
      victory_bar_wins: k,
      true_win_prob: p,
      power: binomTailGe(nEff, k, p),
    });
  }
}

// ─── Optional harness verification gate ───────────────────────────────────────

if (verify) {
  const src = readFileSync(HARNESS_PATH, "utf8");
  const m = src.match(
    /const B1_CONFIRM_COHORT_RECORD_IDS: readonly string\[\] = \[([\s\S]*?)\];/,
  );
  if (!m) fail("harness has no B1_CONFIRM_COHORT_RECORD_IDS const");
  const harnessIds = [...m[1].matchAll(/"([^"]+)"/g)].map((x) => x[1]);
  const a = [...harnessIds].sort().join("\n");
  const b = [...cohort].sort().join("\n");
  if (harnessIds.length !== COHORT_TOTAL)
    fail(`harness const has ${harnessIds.length} ids, expected ${COHORT_TOTAL}`);
  if (a !== b) fail("harness b1-confirm-cohort const does NOT equal the derivation");
  console.log(
    `VERIFY PASS: harness b1-confirm-cohort const equals the derivation (${COHORT_TOTAL} ids).`,
  );
}

// ─── Emit receipt ─────────────────────────────────────────────────────────────

const receipt = {
  schema: "finetune-arc-v2-b1-cohort/1.0.0",
  derivation: {
    package: "datasets/jam-actions-v0-public (v0.5.0, tag jam-actions-v0-0.5.0-cut-2026-07-11)",
    rule:
      "CL = all 12 clair-de-lune test records; LG = the 15 train-song slice19-cohort records; " +
      "NW = 9 of the remaining 88 train records — sorted candidates, Fisher-Yates with " +
      `mulberry32(${SAMPLER_SEED}), first ${NW_COUNT}`,
    sampler_seed: SAMPLER_SEED,
    total: COHORT_TOTAL,
  },
  strata: { CL, LG: [...LG_RECORD_IDS], NW },
  cohort_sorted: [...cohort].sort(),
  victory_bar: {
    rule:
      "victory requires wins >= k*(n_eff) on the primary condition, where n_eff = 36 - ties and " +
      "k*(n) = min{ k : 2*P(Bin(n, 1/2) >= k) <= 0.05 } — exact two-sided sign test, frozen ex-ante",
    alpha: ALPHA,
    table: thresholdTable,
  },
  power_reference_not_binding: powerTable,
};

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, JSON.stringify(receipt, null, 2) + "\n", "utf8");
console.log(`B-1 cohort receipt -> ${outPath}`);
console.log(`  CL ${CL.length} + LG ${LG_RECORD_IDS.length} + NW ${NW.length} = ${cohort.length}`);
console.log(`  NW sample: ${NW.map((id) => id.split(":").slice(0, 2).join(":")).join(", ")}`);
const bar36 = thresholdTable.find((t) => t.n_eff === 36)!;
const bar34 = thresholdTable.find((t) => t.n_eff === 34)!;
console.log(
  `  victory bar: ${bar36.victory_bar_wins}/36 (p=${bar36.exact_two_sided_p_at_bar.toFixed(4)}); at n_eff=34: ${bar34.victory_bar_wins}/34 (p=${bar34.exact_two_sided_p_at_bar.toFixed(4)})`,
);
