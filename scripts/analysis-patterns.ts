// ─── analysis-patterns.ts — Transposition-Aware Pattern Discovery ────────────
//
// Wave W-H (harness upgrade). Adds a transposition-aware repetition layer on
// top of annotate-batch.ts's existing exact/near-identical measure-string
// matching (findRepeatedSections, untouched by this file — that pass stays
// as-is; this one ADDS a different, complementary lens per the dispatch:
// "Keep the existing exact-repeat output too (it's proven) — this ADDS the
// transposition-aware layer.").
//
// Design grounding (docs/feature-pass-v1.5-dispatch.md, "Study-swarm 2",
// findings 54-59, "The design -> Wave W-H"):
//   - Interval-based representations are transposition-invariant BY
//     CONSTRUCTION [57]: the melody "C4 E4 G4" and "D4 F#4 A4" are different
//     measure strings (findRepeatedSections would never group them) but the
//     identical interval sequence [+4, +3] — this is the whole mechanism.
//   - N-gram/substring hashing over that interval sequence, with
//     subsumption dedup (drop patterns wholly contained in longer reported
//     ones), is established, cheap, citable prior art [58].
//   - Rank by compression ratio + compactness + coverage, adapted from
//     COSIATEC's three filter scores [55], and cap the output — string/
//     n-gram frequency over-reports unmemorable patterns otherwise [59].
// ─────────────────────────────────────────────────────────────────────────────

import type { Measure } from "../src/songs/index.js";
import { parseHandEvents, round3 } from "./analysis-chords.js";

// ─── Melodic reduction ──────────────────────────────────────────────────────

interface MelodicEvent {
  measure: number;
  pitch: number;
}

/**
 * Reduce each hand to one representative pitch per onset: the RIGHT hand
 * takes the TOP note of each onset (the typical melodic voice sits on top
 * of a chord/melody-with-harmony texture); the LEFT hand takes the BOTTOM
 * note (the bass-line voice). This is a documented simplification for
 * turning polyphonic onsets into a single monophonic-per-hand stream, not a
 * claim about which hand "really" carries the tune in every texture —
 * parseHandEvents already sorts each onset's pitches ascending, so this is
 * just first/last-element selection, no extra sort needed. Events are
 * concatenated across the WHOLE song (not reset per measure): a repeated
 * phrase that straddles a barline is still findable.
 */
function extractMelodicEvents(measures: Measure[], hand: "rightHand" | "leftHand"): MelodicEvent[] {
  const events: MelodicEvent[] = [];
  for (const m of measures) {
    const onsets = parseHandEvents(hand === "rightHand" ? m.rightHand : m.leftHand);
    for (const onset of onsets) {
      const pitch = hand === "rightHand" ? onset.pitches[onset.pitches.length - 1] : onset.pitches[0];
      events.push({ measure: m.number, pitch });
    }
  }
  return events;
}

/** Signed semitone deltas between consecutive melodic events. Transposing every pitch in a phrase by a constant leaves this sequence byte-identical — the transposition-invariance findRepeatedSections' pitch-string matching doesn't have [57]. */
function intervalSequence(events: MelodicEvent[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < events.length; i++) intervals.push(events[i].pitch - events[i - 1].pitch);
  return intervals;
}

// ─── N-gram hashing with subsumption dedup [58] ────────────────────────────

interface RawPattern {
  length: number; // in intervals; length+1 notes
  starts: number[]; // interval-array indices where this exact interval substring begins
}

/** Minimum pattern length in intervals (4 notes) — short enough to catch a real melodic/bass cell, long enough that a coincidental match is unlikely. */
const MIN_PATTERN_LENGTH = 3;

/** Seed/scan bound on candidate substring length — NOT a hard ceiling on reported pattern length; see extendMatch below, which grows every seed match to its true maximal shared length regardless of this bound. Kept modest for scan cost only. */
const MAX_PATTERN_LENGTH = 24;

/**
 * Grow a just-discovered repeated substring (all `starts` share intervals
 * [s, s+length)) as far as it keeps agreeing past `length`, one interval at
 * a time, stopping the instant any occurrence runs out of intervals or
 * disagrees with the others. Without this, a genuinely long repeated
 * passage (e.g. a 32-interval shared verse) gets discovered piecemeal as
 * many overlapping, near-duplicate windows of length up to MAX_PATTERN_LENGTH
 * — confirmed against this repo's own library while calibrating (a 393-
 * measure song produced 5 top-8 slots that were all the same underlying
 * repeat sliced at slightly different offsets). Extending to the TRUE
 * maximal length first means the existing subsumption check below correctly
 * collapses every shorter/overlapping rediscovery of the same repeat into
 * this one entry, however long the real repeat turns out to be.
 */
function extendMatch(intervals: number[], starts: number[], length: number): number {
  let ext = length;
  for (;;) {
    if (starts.some((s) => s + ext >= intervals.length)) return ext;
    const first = intervals[starts[0] + ext];
    if (starts.some((s) => intervals[s + ext] !== first)) return ext;
    ext++;
  }
}

/**
 * Greedily keep only non-overlapping starts for a fixed match length,
 * earliest-first: an accepted start "claims" the interval indices
 * [s, s+length), and any later candidate start that begins before that
 * claim ends is dropped. For a periodic ostinato (e.g. a C-E-C-E vamp),
 * EVERY start within the repeating cycle matches the same substring key —
 * without this, a 12-measure C-E-C-E vamp reported 12 "occurrences" of one
 * pattern, most of them the same few measures counted 2x over via
 * heavily-overlapping windows (confirmed empirically while calibrating this
 * fix — see analysis-patterns.test.ts's ostinato fixture), wildly inflating
 * compressionRatio (occurrences * patternSize / (patternSize + occurrences)
 * grows with occurrence COUNT, so double-counted occurrences double-count
 * the "compression"). Greedy earliest-first is optimal here (not just
 * simple): every candidate in `starts` shares the SAME length, and for
 * equal-length intervals, greedy-by-earliest-start maximizes the count of
 * accepted non-overlapping intervals — a textbook activity-selection
 * result, not a heuristic. Also incidentally dedupes literal identical
 * starts (an unsorted duplicate `s` value can never clear `nextAllowed`
 * after its own twin already claimed the same span).
 */
function selectNonOverlappingStarts(starts: number[], length: number): number[] {
  const sorted = [...starts].sort((a, b) => a - b);
  const kept: number[] = [];
  let nextAllowedStart = -Infinity;
  for (const s of sorted) {
    if (s >= nextAllowedStart) {
      kept.push(s);
      nextAllowedStart = s + length;
    }
  }
  return kept;
}

/**
 * Find every interval substring of every length in [minLength, maxLength]
 * that repeats 2+ times, longest-first, extends each discovery to its true
 * maximal shared length, then drops any shorter repeat whose occurrences
 * are ALL wholly contained within an already-accepted longer pattern's
 * occurrences [58's "drop patterns subsumed by longer ones"]. A shorter
 * pattern with even ONE occurrence not explained by a longer one is kept —
 * it isn't "wholly" contained, so it still carries information the longer
 * pattern doesn't.
 *
 * Subsumption checking here deliberately works against the RAW (possibly
 * overlapping/redundant) starts, not the non-overlapping set
 * selectNonOverlappingStarts would produce — coverage-checking a SHORTER
 * candidate needs the longer pattern's full redundant start list to decide
 * "is every part of this shorter match already explained," and thinning
 * that list prematurely starves the check of exactly the positions it needs
 * (confirmed empirically: doing the overlap-filtering INSIDE this loop, as
 * an earlier version of this fix tried, broke the periodic-oscillation
 * extension test — a coincidental phrase-boundary alignment left one
 * legitimately-subsumed candidate looking unsubsumed once the longer
 * pattern's own redundant starts had already been thinned down). The
 * overlap-resolution finding 5 asks for happens ONCE, as a final pass over
 * the fully-decided `found` list, in resolveOverlappingOccurrences below —
 * after every subsumption decision has already been made against the rich,
 * unfiltered data.
 */
function findRepeatedIntervalPatterns(intervals: number[], minLength: number, maxLength: number): RawPattern[] {
  const found: RawPattern[] = [];
  const recorded = new Set<string>(); // "<extendedLength>:<starts>" already emitted, from any scan length that converges on the same maximal match
  const cappedMax = Math.min(maxLength, intervals.length - 1);

  for (let length = cappedMax; length >= minLength; length--) {
    const seen = new Map<string, number[]>();
    for (let start = 0; start + length <= intervals.length; start++) {
      const key = intervals.slice(start, start + length).join(",");
      let starts = seen.get(key);
      if (!starts) {
        starts = [];
        seen.set(key, starts);
      }
      starts.push(start);
    }
    for (const starts of seen.values()) {
      if (starts.length < 2) continue;
      const extendedLength = extendMatch(intervals, starts, length);
      const dedupeKey = `${extendedLength}:${starts.join(",")}`;
      if (recorded.has(dedupeKey)) continue;
      const whollySubsumed = starts.every((s) => isCoveredByLongerPattern(found, s, extendedLength));
      if (whollySubsumed) continue;
      recorded.add(dedupeKey);
      found.push({ length: extendedLength, starts });
    }
  }
  return resolveOverlappingOccurrences(found);
}

function isCoveredByLongerPattern(found: RawPattern[], start: number, length: number): boolean {
  return found.some((p) => p.length > length && p.starts.some((s) => s <= start && start + length <= s + p.length));
}

/**
 * Final pass, after all subsumption decisions are made: collapse each
 * accepted pattern's own starts down to a non-overlapping, deduped set
 * (selectNonOverlappingStarts) — this is finding 5's actual fix, applied
 * once the discovery algorithm no longer needs the redundant raw data.
 *
 * For a densely-periodic ostinato (e.g. a C-E-G-E vamp repeated many
 * times), extendMatch correctly confirms agreement far past the point where
 * the raw starts sit closer together than that agreement length — it's
 * measuring "how long does this periodic signal's autocorrelation hold,"
 * which for truly periodic content can run nearly to the end of the
 * available intervals, not "how long is the shared phrase." Naively
 * claiming the full extended length per occurrence would then leave room
 * for at most one non-overlapping instance, incorrectly discarding a
 * pattern that's actually a strong, cleanly-repeating figure. When that
 * happens, fall back to the tightest length that still admits 2+
 * non-overlapping occurrences among this group's own raw starts: the
 * smallest gap between consecutive (sorted) starts — bounded below by
 * MIN_PATTERN_LENGTH, since anything shorter isn't a reportable pattern at
 * all by this module's own vocabulary floor (a 2-note back-and-forth, for
 * instance, genuinely doesn't clear that bar and is correctly dropped, not
 * rescued).
 */
function resolveOverlappingOccurrences(found: RawPattern[]): RawPattern[] {
  const resolved: RawPattern[] = [];
  for (const p of found) {
    let length = p.length;
    let starts = selectNonOverlappingStarts(p.starts, length);
    if (starts.length < 2) {
      const sorted = [...p.starts].sort((a, b) => a - b);
      let minGap = Infinity;
      for (let i = 1; i < sorted.length; i++) minGap = Math.min(minGap, sorted[i] - sorted[i - 1]);
      if (minGap >= MIN_PATTERN_LENGTH) {
        length = minGap;
        starts = selectNonOverlappingStarts(p.starts, length);
      }
    }
    if (starts.length >= 2) resolved.push({ length, starts });
  }
  return resolved;
}

// ─── Ranking: compression ratio, compactness, coverage [55] ────────────────

export interface PatternOccurrence {
  startMeasure: number;
  endMeasure: number;
  /** Semitone offset of this occurrence's first pitch relative to the group's first (canonical) occurrence. 0 for the canonical occurrence and for any exact-pitch repeat. */
  transposition: number;
}

export interface PatternGroup {
  hand: "rightHand" | "leftHand";
  /** Pattern length in intervals (length+1 notes). */
  length: number;
  occurrences: PatternOccurrence[];
  /** True when at least one occurrence is a transposition-only match (same intervals, different absolute pitch) — the finding this new layer exists to surface. False means every occurrence is byte-for-byte pitch-identical (still a valid, if less novel, find). */
  transposed: boolean;
  evidenceGrade: "strong" | "moderate" | "weak";
  /** Adapted from COSIATEC: (occurrences * patternSize) / (patternSize + occurrences) — how much this pattern "compresses" the material it covers if stored once plus one location per occurrence. */
  compressionRatio: number;
  /** Mean, across occurrences, of (pattern density within its own measure span) / (this hand's average onset density for the whole song), clamped to 1. Rewards occurrences that read as a contiguous phrase rather than notes scattered thinly across many largely-silent measures; normalized per-hand so a naturally sparse bass line isn't unfairly penalized against a busier melody line. */
  compactness: number;
  /** Fraction of this hand's total onsets covered by some occurrence of this pattern. */
  coverage: number;
}

export interface PatternAnalysis {
  label: string;
  groups: PatternGroup[];
}

function gradeEvidence(length: number, occurrenceCount: number, coverage: number): PatternGroup["evidenceGrade"] {
  if (occurrenceCount >= 3 && length >= 5) return "strong";
  if (occurrenceCount >= 2 && (length >= 4 || coverage >= 0.1)) return "moderate";
  return "weak";
}

function handAvgEventsPerMeasure(eventCount: number, songMeasureCount: number): number {
  return songMeasureCount > 0 ? eventCount / songMeasureCount : 0;
}

function buildPatternGroups(
  hand: "rightHand" | "leftHand",
  events: MelodicEvent[],
  rawPatterns: RawPattern[],
  songMeasureCount: number,
): PatternGroup[] {
  const totalEvents = events.length;
  const avgDensity = handAvgEventsPerMeasure(totalEvents, songMeasureCount);

  return rawPatterns.map((raw) => {
    const patternSize = raw.length + 1;
    const canonicalStart = raw.starts[0];

    const occurrences: PatternOccurrence[] = raw.starts.map((s) => ({
      startMeasure: events[s].measure,
      endMeasure: events[s + raw.length].measure,
      transposition: events[s].pitch - events[canonicalStart].pitch,
    }));
    const transposed = occurrences.some((o) => o.transposition !== 0);

    const coveredIdx = new Set<number>();
    let compactnessSum = 0;
    for (const s of raw.starts) {
      for (let k = 0; k <= raw.length; k++) coveredIdx.add(s + k);
      const spanMeasures = events[s + raw.length].measure - events[s].measure + 1;
      const density = patternSize / spanMeasures;
      compactnessSum += avgDensity > 0 ? Math.min(1, density / avgDensity) : 0;
    }
    const compactness = compactnessSum / raw.starts.length;
    const coverage = totalEvents > 0 ? coveredIdx.size / totalEvents : 0;
    const compressionRatio = (raw.starts.length * patternSize) / (patternSize + raw.starts.length);

    return {
      hand,
      length: raw.length,
      occurrences,
      transposed,
      evidenceGrade: gradeEvidence(raw.length, raw.starts.length, coverage),
      compressionRatio: round3(compressionRatio),
      compactness: round3(compactness),
      coverage: round3(coverage),
    };
  });
}

// ─── Whole-song analysis ────────────────────────────────────────────────────

/** Cap on reported groups [59] — over-generation is intrinsic to n-gram frequency matching; rank and truncate rather than list everything. */
const TOP_N_PATTERNS = 8;

/**
 * A candidate whose occupied measures overlap this fraction or more with an
 * already-kept pattern's occupied measures is dropped from the top-N list
 * [59's cap-and-rank, extended: rank alone isn't enough when one phase-
 * shifted family dominates]. Without this, a single long, mechanically
 * regular left-hand figure that gets discovered as several near-duplicate,
 * heavily-overlapping RawPattern groups (different phase alignments of
 * essentially the same underlying material — see
 * findRepeatedIntervalPatterns' own subsumption dedup, which only catches
 * WHOLE containment, not heavy-but-partial overlap) can crowd out most of
 * the top-8 slots with restatements of one family, at the direct expense of
 * genuinely distinct patterns elsewhere in the song (confirmed empirically
 * against this repo's own library: stormy-monday's left hand put ~6 of 8
 * slots into the same 48-measure-period family before this fix). 0.5 is a
 * "meaningfully redundant, not just coincidentally adjacent" bar: two
 * independent short patterns sharing a measure or two at a phrase seam
 * shouldn't compete for a slot, but two patterns that are substantially the
 * SAME material should.
 */
const OCCURRENCE_OVERLAP_DIVERSITY_FLOOR = 0.5;

function rankScore(g: PatternGroup): number {
  return g.compressionRatio * g.compactness * g.coverage;
}

/** Every measure number occupied by ANY occurrence of this group (inclusive of both endpoints), as a Set for cheap overlap-fraction checks. */
function occupiedMeasures(group: PatternGroup): Set<number> {
  const occupied = new Set<number>();
  for (const occ of group.occurrences) {
    for (let measure = occ.startMeasure; measure <= occ.endMeasure; measure++) occupied.add(measure);
  }
  return occupied;
}

/**
 * True when `candidate`'s own occupied-measure footprint overlaps an
 * already-kept SAME-HAND group's footprint by >= OCCURRENCE_OVERLAP_DIVERSITY_FLOOR
 * — the fraction is relative to the CANDIDATE's own size (how much of the
 * new entry would be redundant with what's already reported), not the kept
 * group's. Scoped to the same hand deliberately: a right-hand melodic motif
 * and a left-hand bass figure covering the same measures are different
 * musical content, not redundant restatements of each other, even though
 * they share measure numbers — only two entries from the SAME voice
 * competing to describe the same stretch of music are candidates for
 * "redundant."
 */
function overlapsKeptGroup(candidate: PatternGroup, candidateFootprint: Set<number>, kept: { group: PatternGroup; footprint: Set<number> }[]): boolean {
  if (candidateFootprint.size === 0) return false;
  for (const k of kept) {
    if (k.group.hand !== candidate.hand) continue;
    let overlap = 0;
    for (const measure of candidateFootprint) if (k.footprint.has(measure)) overlap++;
    if (overlap / candidateFootprint.size >= OCCURRENCE_OVERLAP_DIVERSITY_FLOOR) return true;
  }
  return false;
}

/**
 * Greedily builds the top-N list in descending rank order, skipping any
 * candidate whose occupied measures are substantially redundant with a
 * SAME-HAND pattern already kept [59, extended — see
 * OCCURRENCE_OVERLAP_DIVERSITY_FLOOR]. Diversity-over-redundancy: a lower-
 * ranked but genuinely DIFFERENT pattern earns a slot a higher-ranked
 * restatement of an already-represented family would otherwise have taken.
 * Exported for direct testing: constructing note-string fixtures where two
 * DIFFERENT (non-subsumed) pattern families genuinely overlap in measure
 * footprint is possible but fragile (monophonic content makes "two
 * different families with overlapping timing" an unusual shape to coax out
 * of the discovery pipeline) — testing this selection step directly against
 * hand-built PatternGroup fixtures is more reliable and just as faithful,
 * since this is the ONE function finding 6's fix actually lives in.
 */
export function selectDiverseTopN(rankedGroups: PatternGroup[], n: number): PatternGroup[] {
  const kept: { group: PatternGroup; footprint: Set<number> }[] = [];
  for (const group of rankedGroups) {
    if (kept.length >= n) break;
    const footprint = occupiedMeasures(group);
    if (overlapsKeptGroup(group, footprint, kept)) continue;
    kept.push({ group, footprint });
  }
  return kept.map((k) => k.group);
}

/**
 * Transposition-aware repeated-pattern discovery for a whole song, one hand
 * at a time (right hand's melodic reduction, then left hand's), merged into
 * one ranked, capped list. Complements — does not replace — the harness's
 * existing exact/near-identical measure-string repeat detection.
 */
export function analyzePatterns(measures: Measure[]): PatternAnalysis {
  const songMeasureCount = measures.length;
  const allGroups: PatternGroup[] = [];

  for (const hand of ["rightHand", "leftHand"] as const) {
    const events = extractMelodicEvents(measures, hand);
    const intervals = intervalSequence(events);
    const rawPatterns = findRepeatedIntervalPatterns(intervals, MIN_PATTERN_LENGTH, MAX_PATTERN_LENGTH);
    allGroups.push(...buildPatternGroups(hand, events, rawPatterns, songMeasureCount));
  }

  allGroups.sort((a, b) => {
    const diff = rankScore(b) - rankScore(a);
    if (diff !== 0) return diff;
    if (b.length !== a.length) return b.length - a.length;
    const aFirst = a.occurrences[0]?.startMeasure ?? 0;
    const bFirst = b.occurrences[0]?.startMeasure ?? 0;
    if (aFirst !== bFirst) return aFirst - bFirst;
    return a.hand.localeCompare(b.hand);
  });

  return { label: "repetition candidates (evidence-graded)", groups: selectDiverseTopN(allGroups, TOP_N_PATTERNS) };
}
