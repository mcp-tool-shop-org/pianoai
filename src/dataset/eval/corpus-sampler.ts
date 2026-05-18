// ─── jam-actions-v0 Slice 12 Corpus-Scale Eval Sampler ─────────────────────────
//
// Pure deterministic stratified sampler used by the corpus-scale eval runner.
// No LLM calls, no HTTP, no I/O — just record selection.
//
// Inputs:
//   - records:  array of public-package records (115 in the v0 public corpus)
//   - config:   { seed, e1Size, e2PairSize, e3Size, requiredRecordIds }
//
// Output:
//   - SamplePlan describing per-evaluator subsamples + strata buckets.
//
// Determinism contract:
//   buildSample(R, C) must return BYTE-IDENTICAL results across runs given
//   the same R and C. The shuffle is a hash-based sort
//   (sha256-bucketed via SHA-256 of `${seed}:${record.id}`), not Math.random().
//   Test 1 asserts this invariant.
//
// Required-inclusion contract (LOCKED):
//   - All 6 Slice 11 enriched records MUST appear in E1 sample (where they
//     have target_traces) AND in E3 sample.
//   - All 4 unique pairs containing an enriched record MUST appear in E2.
//   - Stratification buckets (opening / middle / cadential / Bach
//     texture-repetition / anacrusis) must each be represented per-evaluator
//     where the records exist in the corpus.
//
// Sampler abort policy:
//   - Required inclusion that cannot be satisfied (missing record in input)
//     → throw with explicit message. No silent fallback.
//   - Bucket impossible to fill (no Bach late-prelude records present)
//     → record diagnostic in SamplePlan; do not throw. Caller decides.
// ─────────────────────────────────────────────────────────────────────────────

import { createHash } from "node:crypto";

// ─── Public types ──────────────────────────────────────────────────────────────

/**
 * Minimal record shape the sampler needs. The runner casts the public-package
 * record JSON (which has many more fields — target_trace, observation, etc.)
 * into this shape before calling buildSample.
 */
export interface SamplerRecord {
  id: string;
  scope: {
    song_id: string;
    phrase_window: string;
    window_role?: "prompt" | "continuation_target" | "standalone";
    paired_prompt_record_id?: string;
    continuation_target_window?: [number, number];
  };
  /** Optional — only used by the sampler to check eligibility. */
  has_target_trace?: boolean;
  /** Optional — present when annotation_target.rhythm_onset === "not_computable" */
  rhythm_onset_not_computable?: boolean;
}

export interface SamplePair {
  promptId: string;
  targetId: string;
  containsEnriched: boolean;
  enrichedHalves: string[];
}

export interface StratumBuckets {
  opening: string[];
  middle: string[];
  cadential: string[];
  bachTextureRepetition: string[];
  anacrusis: string[];
}

export interface SamplePlan {
  seed: string;
  generatedAt: string;
  enrichedRecords: string[];
  enrichedPairs: SamplePair[];
  e1: {
    recordIds: string[];
    buckets: StratumBuckets;
    enrichedIncluded: string[];
  };
  e2: {
    pairs: SamplePair[];
    enrichedPairsIncluded: SamplePair[];
  };
  e3: {
    recordIds: string[];
    buckets: StratumBuckets;
    enrichedIncluded: string[];
  };
  diagnostics: string[];
}

export interface SamplerConfig {
  seed: string;
  e1Size: number;
  e2PairSize: number;
  e3Size: number;
  /** Records that MUST appear in E1 + E3 samples (default: SLICE_11_ENRICHED_RECORD_IDS). */
  requiredRecordIds: readonly string[];
  /**
   * Pairs (identified by promptId) that MUST appear in E2.
   * The sampler computes them from requiredRecordIds + record graph if omitted.
   */
  requiredPairPromptIds?: readonly string[];
}

// ─── Locked constants ──────────────────────────────────────────────────────────

/** The 6 records changed in Slice 11 enrichment-overrides.json. */
export const SLICE_11_ENRICHED_RECORD_IDS: readonly string[] = [
  "pathetique-mvt2:m025-028:piano:mcp-session:v1",
  "pathetique-mvt2:m029-032:piano:mcp-session:v1",
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m045-048:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m049-052:piano:mcp-session:v1",
  "bach-prelude-c-major-bwv846:m053-056:piano:mcp-session:v1",
];

/** The Bach late-prelude window where the Krueger-arrangement coda starts (m. 45+). */
export const BACH_TEXTURE_REPETITION_PREFIXES: readonly string[] = [
  "bach-prelude-c-major-bwv846:m045-048",
  "bach-prelude-c-major-bwv846:m049-052",
  "bach-prelude-c-major-bwv846:m053-056",
];

/** Anacrusis case: Schumann m045+ (rhythm_onset: not_computable) plus Pathétique pair. */
export const ANACRUSIS_RECORD_IDS: readonly string[] = [
  "schumann-traumerei:m045-048:piano:mcp-session:v1",
];

export const DEFAULT_CONFIG: SamplerConfig = {
  seed: "slice12-2026-05-17",
  e1Size: 24,
  e2PairSize: 12,
  e3Size: 24,
  requiredRecordIds: SLICE_11_ENRICHED_RECORD_IDS,
};

// ─── Deterministic hash-bucketed shuffle ───────────────────────────────────────

/**
 * SHA-256 hex of (seed + ":" + key). Used as the sort key for the
 * deterministic shuffle. Same (seed, key) -> same hex -> stable position
 * across runs and platforms.
 */
function hashKey(seed: string, key: string): string {
  return createHash("sha256").update(`${seed}:${key}`).digest("hex");
}

/**
 * Shuffle an array deterministically by sorting on hash(seed + ":" + key(item)).
 * Pure function — never mutates input. Same inputs always produce same output.
 */
export function deterministicShuffle<T>(
  items: readonly T[],
  seed: string,
  keyOf: (item: T) => string,
): T[] {
  return [...items].sort((a, b) => {
    const ha = hashKey(seed, keyOf(a));
    const hb = hashKey(seed, keyOf(b));
    if (ha < hb) return -1;
    if (ha > hb) return 1;
    return 0;
  });
}

// ─── Phrase position classification ────────────────────────────────────────────

/**
 * Parse the starting measure from a phrase_window like "measures 25-28" or
 * "measures 1-8". Returns null on parse failure.
 */
export function parseStartMeasure(phraseWindow: string): number | null {
  const m = /measures? (\d+)-\d+/.exec(phraseWindow);
  return m ? parseInt(m[1], 10) : null;
}

/**
 * Classify a record's phrase position into one of:
 *   - "opening"    : starts at measure 1
 *   - "middle"     : measures 2..(songLength - 8)
 *   - "cadential"  : starts at the song's last 8 measures
 *   - "unknown"    : cannot classify
 *
 * Cadential detection is heuristic based on song-by-song known lengths. We
 * use a song-window map to determine each song's last phrase window; if the
 * record's starting measure equals or exceeds (lastStart - 4) it's cadential.
 */
export type PhrasePosition = "opening" | "middle" | "cadential" | "unknown";

/**
 * Build a per-song "last starting measure" map from the records: for each
 * song_id, find the largest start-measure that appears among its records.
 */
function buildLastStartMap(records: readonly SamplerRecord[]): Map<string, number> {
  const lastStart = new Map<string, number>();
  for (const r of records) {
    const start = parseStartMeasure(r.scope.phrase_window);
    if (start === null) continue;
    const cur = lastStart.get(r.scope.song_id) ?? 0;
    if (start > cur) lastStart.set(r.scope.song_id, start);
  }
  return lastStart;
}

export function classifyPosition(
  record: SamplerRecord,
  lastStartMap: Map<string, number>,
): PhrasePosition {
  const start = parseStartMeasure(record.scope.phrase_window);
  if (start === null) return "unknown";
  if (start === 1) return "opening";
  const last = lastStartMap.get(record.scope.song_id);
  if (last === undefined) return "unknown";
  // Cadential = within last 8 bars of the song's last known phrase window.
  if (start >= last - 4) return "cadential";
  return "middle";
}

// ─── Pair resolution ───────────────────────────────────────────────────────────

/**
 * Build the (prompt, target) pair graph from a flat record list. Returns
 * pairs sorted by prompt ID for stable ordering.
 *
 * A record is a prompt iff window_role === "prompt". Its target is the
 * single record with window_role === "continuation_target" and
 * paired_prompt_record_id === prompt.id.
 */
export function resolveAllPairs(records: readonly SamplerRecord[]): SamplePair[] {
  const enrichedSet = new Set(SLICE_11_ENRICHED_RECORD_IDS);
  const targets = records.filter(
    (r) => r.scope.window_role === "continuation_target",
  );
  const targetByPrompt = new Map<string, SamplerRecord>();
  for (const t of targets) {
    const pid = t.scope.paired_prompt_record_id;
    if (pid) targetByPrompt.set(pid, t);
  }

  const pairs: SamplePair[] = [];
  for (const r of records) {
    if (r.scope.window_role !== "prompt") continue;
    const target = targetByPrompt.get(r.id);
    if (!target) continue;
    const enrichedHalves: string[] = [];
    if (enrichedSet.has(r.id)) enrichedHalves.push(r.id);
    if (enrichedSet.has(target.id)) enrichedHalves.push(target.id);
    pairs.push({
      promptId: r.id,
      targetId: target.id,
      containsEnriched: enrichedHalves.length > 0,
      enrichedHalves,
    });
  }
  return pairs.sort((a, b) => (a.promptId < b.promptId ? -1 : 1));
}

// ─── Bucket classification helpers ─────────────────────────────────────────────

function isBachTextureRepetition(record: SamplerRecord): boolean {
  return BACH_TEXTURE_REPETITION_PREFIXES.some((pfx) => record.id.startsWith(pfx));
}

function isAnacrusisCase(record: SamplerRecord): boolean {
  return ANACRUSIS_RECORD_IDS.includes(record.id) || record.rhythm_onset_not_computable === true;
}

function bucketsForSelection(
  selectedIds: readonly string[],
  records: readonly SamplerRecord[],
  lastStartMap: Map<string, number>,
): StratumBuckets {
  const byId = new Map(records.map((r) => [r.id, r] as const));
  const buckets: StratumBuckets = {
    opening: [],
    middle: [],
    cadential: [],
    bachTextureRepetition: [],
    anacrusis: [],
  };
  for (const id of selectedIds) {
    const r = byId.get(id);
    if (!r) continue;
    const pos = classifyPosition(r, lastStartMap);
    if (pos === "opening") buckets.opening.push(id);
    else if (pos === "middle") buckets.middle.push(id);
    else if (pos === "cadential") buckets.cadential.push(id);
    if (isBachTextureRepetition(r)) buckets.bachTextureRepetition.push(id);
    if (isAnacrusisCase(r)) buckets.anacrusis.push(id);
  }
  return buckets;
}

// ─── Strata-aware fill ─────────────────────────────────────────────────────────

interface StratumTargets {
  opening: number;
  middle: number;
  cadential: number;
  bachTextureRepetition: number;
  anacrusis: number;
}

const E1_E3_STRATUM_TARGETS: StratumTargets = {
  opening: 2,
  middle: 2,
  cadential: 1,
  bachTextureRepetition: 1,
  anacrusis: 1,
};

/**
 * Fill a sample to `targetSize` while honoring required inclusions and
 * stratum minimums (opening / middle / cadential / Bach / anacrusis).
 *
 * Algorithm:
 *   1. Start with `required` records.
 *   2. For each stratum, count how many `required` records already satisfy it.
 *   3. For each unsatisfied stratum, take records from the candidate pool
 *      (shuffled deterministically, filtered to that stratum) until the
 *      minimum is met.
 *   4. Fill the remaining slots from the global shuffled candidate pool.
 *
 * Records always reach the target size (assuming the pool is large enough);
 * stratum minimums are best-effort (logged in diagnostics if unmet).
 */
function buildStratifiedSample(
  required: readonly string[],
  candidates: readonly SamplerRecord[],
  lastStartMap: Map<string, number>,
  targets: StratumTargets,
  targetSize: number,
  seed: string,
  poolName: string,
  diagnostics: string[],
): string[] {
  const requiredSet = new Set(required);
  const selectedIds = new Set<string>(required);

  // Verify all required exist in the candidate set; abort if not.
  const candidateIds = new Set(candidates.map((c) => c.id));
  for (const r of required) {
    if (!candidateIds.has(r)) {
      throw new Error(
        `Sampler abort: required record '${r}' not found in ${poolName} candidate pool. ` +
          `Verify the public package contains all 6 Slice 11 enriched records.`,
      );
    }
  }

  // Bucket the required records.
  const currentBuckets = bucketsForSelection(
    [...selectedIds],
    candidates,
    lastStartMap,
  );

  // Determine which strata still need more.
  const strataNeeds: Array<{
    name: keyof StratumTargets;
    short: number;
    pred: (r: SamplerRecord) => boolean;
  }> = [
    {
      name: "opening",
      short: targets.opening - currentBuckets.opening.length,
      pred: (r) => classifyPosition(r, lastStartMap) === "opening",
    },
    {
      name: "middle",
      short: targets.middle - currentBuckets.middle.length,
      pred: (r) => classifyPosition(r, lastStartMap) === "middle",
    },
    {
      name: "cadential",
      short: targets.cadential - currentBuckets.cadential.length,
      pred: (r) => classifyPosition(r, lastStartMap) === "cadential",
    },
    {
      name: "bachTextureRepetition",
      short: targets.bachTextureRepetition - currentBuckets.bachTextureRepetition.length,
      pred: (r) => isBachTextureRepetition(r),
    },
    {
      name: "anacrusis",
      short: targets.anacrusis - currentBuckets.anacrusis.length,
      pred: (r) => isAnacrusisCase(r),
    },
  ];

  // Pool to choose from = candidates excluding already-selected.
  const remainingPool = candidates.filter((r) => !selectedIds.has(r.id));

  // Deterministic global shuffle.
  const shuffled = deterministicShuffle(
    remainingPool,
    seed,
    (r) => r.id,
  );

  // Fill stratum minimums first.
  for (const need of strataNeeds) {
    if (need.short <= 0) continue;
    const matching = shuffled.filter(
      (r) => need.pred(r) && !selectedIds.has(r.id),
    );
    const take = Math.min(need.short, matching.length);
    if (take < need.short) {
      diagnostics.push(
        `[${poolName}] stratum '${need.name}' under-filled: needed ${need.short} more, only ${matching.length} candidates available.`,
      );
    }
    for (let i = 0; i < take; i++) {
      selectedIds.add(matching[i].id);
    }
  }

  // Fill remaining slots from the global shuffle.
  for (const r of shuffled) {
    if (selectedIds.size >= targetSize) break;
    if (!selectedIds.has(r.id)) selectedIds.add(r.id);
  }

  // Final size check (edge case: candidate pool smaller than target).
  if (selectedIds.size < targetSize) {
    diagnostics.push(
      `[${poolName}] target size ${targetSize} not reached; candidate pool exhausted at ${selectedIds.size} (required: ${requiredSet.size}, pool: ${candidates.length}).`,
    );
  }

  // Sort for stable output ordering (required first to keep them visible at the top,
  // then alphabetical for the rest).
  const requiredList = required.filter((r) => selectedIds.has(r));
  const restList = [...selectedIds]
    .filter((id) => !requiredSet.has(id))
    .sort();
  return [...requiredList, ...restList];
}

// ─── E2 pair sample ────────────────────────────────────────────────────────────

function buildE2PairSample(
  allPairs: readonly SamplePair[],
  requiredPromptIds: readonly string[],
  targetPairs: number,
  seed: string,
  diagnostics: string[],
): SamplePair[] {
  const byPrompt = new Map(allPairs.map((p) => [p.promptId, p] as const));
  const selected = new Map<string, SamplePair>();

  // 1. Required pairs first.
  for (const pid of requiredPromptIds) {
    const pair = byPrompt.get(pid);
    if (!pair) {
      throw new Error(
        `Sampler abort: required E2 pair with promptId '${pid}' not found among ${allPairs.length} resolved pairs. ` +
          `Verify the public package contains all enriched-record pairs.`,
      );
    }
    selected.set(pid, pair);
  }

  // 2. Fill remaining slots from the deterministically shuffled non-required pool.
  const remaining = allPairs.filter((p) => !selected.has(p.promptId));
  const shuffled = deterministicShuffle(remaining, seed, (p) => p.promptId);
  for (const p of shuffled) {
    if (selected.size >= targetPairs) break;
    selected.set(p.promptId, p);
  }

  if (selected.size < targetPairs) {
    diagnostics.push(
      `[e2] target pair count ${targetPairs} not reached; only ${selected.size} pairs available.`,
    );
  }

  // Final ordering: required pairs (in input order), then rest by prompt id.
  const requiredOut = requiredPromptIds
    .map((pid) => selected.get(pid))
    .filter((p): p is SamplePair => p !== undefined);
  const restOut = [...selected.values()]
    .filter((p) => !requiredPromptIds.includes(p.promptId))
    .sort((a, b) => (a.promptId < b.promptId ? -1 : 1));
  return [...requiredOut, ...restOut];
}

// ─── Main entry point ──────────────────────────────────────────────────────────

/**
 * Build a deterministic stratified sample from the public-package records.
 *
 * Determinism: identical (records, config) always produces identical output.
 * Stratification: each evaluator's sample contains the locked stratum
 * minimums (opening / middle / cadential / Bach texture-repetition /
 * anacrusis) where the corpus permits.
 * Required inclusion: enriched records always appear in E1 + E3; enriched
 * pairs always appear in E2. Missing required record => throw.
 */
export function buildSample(
  records: readonly SamplerRecord[],
  config: SamplerConfig = DEFAULT_CONFIG,
): SamplePlan {
  const diagnostics: string[] = [];
  const lastStartMap = buildLastStartMap(records);

  // Validate required records exist in the input.
  const recordIds = new Set(records.map((r) => r.id));
  for (const rid of config.requiredRecordIds) {
    if (!recordIds.has(rid)) {
      throw new Error(
        `Sampler abort: required record '${rid}' not present in input records (have ${records.length}).`,
      );
    }
  }

  // E1 candidate pool: records with a target_trace.
  // The runner sets has_target_trace from the loaded JSON; if missing we
  // assume all records have a target_trace (the v0 schema requires it).
  const e1Candidates = records.filter((r) => r.has_target_trace !== false);

  // E3 candidate pool: all records (every record has an annotation_target).
  const e3Candidates = records;

  // ─── E1 sample ────────────────────────────────────────────────────────────
  const e1RequiredInPool = config.requiredRecordIds.filter((rid) =>
    e1Candidates.some((c) => c.id === rid),
  );
  if (e1RequiredInPool.length !== config.requiredRecordIds.length) {
    diagnostics.push(
      `[e1] ${config.requiredRecordIds.length - e1RequiredInPool.length} required records lack target_trace and were dropped from E1 inclusion.`,
    );
  }
  const e1Selected = buildStratifiedSample(
    e1RequiredInPool,
    e1Candidates,
    lastStartMap,
    E1_E3_STRATUM_TARGETS,
    config.e1Size,
    config.seed,
    "e1",
    diagnostics,
  );

  // ─── E3 sample ────────────────────────────────────────────────────────────
  const e3Selected = buildStratifiedSample(
    config.requiredRecordIds,
    e3Candidates,
    lastStartMap,
    E1_E3_STRATUM_TARGETS,
    config.e3Size,
    config.seed,
    "e3",
    diagnostics,
  );

  // ─── E2 pair sample ───────────────────────────────────────────────────────
  const allPairs = resolveAllPairs(records);
  const enrichedPairs = allPairs.filter((p) => p.containsEnriched);
  const requiredPairPromptIds =
    config.requiredPairPromptIds ?? enrichedPairs.map((p) => p.promptId);
  const e2Pairs = buildE2PairSample(
    allPairs,
    requiredPairPromptIds,
    config.e2PairSize,
    config.seed,
    diagnostics,
  );

  return {
    seed: config.seed,
    generatedAt: new Date().toISOString(),
    enrichedRecords: [...config.requiredRecordIds],
    enrichedPairs,
    e1: {
      recordIds: e1Selected,
      buckets: bucketsForSelection(e1Selected, records, lastStartMap),
      enrichedIncluded: e1Selected.filter((id) =>
        (config.requiredRecordIds as readonly string[]).includes(id),
      ),
    },
    e2: {
      pairs: e2Pairs,
      enrichedPairsIncluded: e2Pairs.filter((p) => p.containsEnriched),
    },
    e3: {
      recordIds: e3Selected,
      buckets: bucketsForSelection(e3Selected, records, lastStartMap),
      enrichedIncluded: e3Selected.filter((id) =>
        (config.requiredRecordIds as readonly string[]).includes(id),
      ),
    },
    diagnostics,
  };
}

// ─── Manifest schema (for the runner) ──────────────────────────────────────────

/**
 * Serializable sample manifest written alongside the result artifact. Includes
 * the seed + config + selected records + strata so the run is reproducible
 * given the public package + this manifest.
 */
export interface SampleManifest {
  schema_version: string;
  seed: string;
  generated_at: string;
  config: {
    e1_size: number;
    e2_pair_size: number;
    e3_size: number;
    stratum_targets: StratumTargets;
    required_records: string[];
    required_pair_prompt_ids: string[];
  };
  e1: {
    record_ids: string[];
    strata: StratumBuckets;
    enriched_included: string[];
  };
  e2: {
    pairs: Array<{ prompt_id: string; target_id: string; contains_enriched: boolean; enriched_halves: string[] }>;
    enriched_pairs_included: string[];
  };
  e3: {
    record_ids: string[];
    strata: StratumBuckets;
    enriched_included: string[];
  };
  diagnostics: string[];
}

export const SAMPLE_MANIFEST_SCHEMA_VERSION = "corpus-scale-sample/1.0.0";

export function buildSampleManifest(
  plan: SamplePlan,
  config: SamplerConfig,
): SampleManifest {
  return {
    schema_version: SAMPLE_MANIFEST_SCHEMA_VERSION,
    seed: plan.seed,
    generated_at: plan.generatedAt,
    config: {
      e1_size: config.e1Size,
      e2_pair_size: config.e2PairSize,
      e3_size: config.e3Size,
      stratum_targets: E1_E3_STRATUM_TARGETS,
      required_records: [...config.requiredRecordIds],
      required_pair_prompt_ids:
        config.requiredPairPromptIds !== undefined
          ? [...config.requiredPairPromptIds]
          : plan.enrichedPairs.map((p) => p.promptId),
    },
    e1: {
      record_ids: plan.e1.recordIds,
      strata: plan.e1.buckets,
      enriched_included: plan.e1.enrichedIncluded,
    },
    e2: {
      pairs: plan.e2.pairs.map((p) => ({
        prompt_id: p.promptId,
        target_id: p.targetId,
        contains_enriched: p.containsEnriched,
        enriched_halves: p.enrichedHalves,
      })),
      enriched_pairs_included: plan.e2.enrichedPairsIncluded.map(
        (p) => p.promptId,
      ),
    },
    e3: {
      record_ids: plan.e3.recordIds,
      strata: plan.e3.buckets,
      enriched_included: plan.e3.enrichedIncluded,
    },
    diagnostics: plan.diagnostics,
  };
}
